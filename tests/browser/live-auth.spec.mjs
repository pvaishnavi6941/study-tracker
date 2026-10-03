import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { completedWorkbook } from "./workbook.mjs";

const credentials = fs.existsSync(".env.test.local")
  ? Object.fromEntries(
      fs
        .readFileSync(".env.test.local", "utf8")
        .split(/\r?\n/)
        .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
        .map((line) => {
          const i = line.indexOf("=");
          return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
        }),
    )
  : {};

// Uses real project auth; no HTTP interception. First-use setup is temporarily
// dismissed without adding skills/topics, and its preference is restored.
test("live login, persistent session, logout, and switching confirmed accounts", async ({
  page,
}) => {
  const names = [
    "CADENCE_TEST_EMAIL_A",
    "CADENCE_TEST_PASSWORD_A",
    "CADENCE_TEST_EMAIL_B",
    "CADENCE_TEST_PASSWORD_B",
  ];
  test.skip(
    names.some((name) => !credentials[name]),
    "Two confirmed test accounts in .env.test.local are required.",
  );
  const publicConfig = Object.fromEntries(
    fs
      .readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      }),
  );
  const temporary = [];
  try {
    for (const account of ["A", "B", "A"]) {
      const client = createClient(
        publicConfig.VITE_SUPABASE_URL,
        publicConfig.VITE_SUPABASE_PUBLISHABLE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      );
      const login = await client.auth.signInWithPassword({
        email: credentials[`CADENCE_TEST_EMAIL_${account}`],
        password: credentials[`CADENCE_TEST_PASSWORD_${account}`],
      });
      if (login.error) throw login.error;
      const original = await client.rpc("cadence_snapshot");
      if (original.error) throw original.error;
      temporary.push({ client, preferences: original.data.data.preferences });
      if (!original.data.data.preferences.onboardingDone) {
        const setup = await client.rpc("cadence_apply_changes", {
          expected_revision: original.data.revision,
          changes: {
            preferences: {
              ...original.data.data.preferences,
              onboardingDone: true,
            },
          },
        });
        if (setup.error) throw setup.error;
      }
      await page.goto("/");
      await page
        .getByLabel("EMAIL", { exact: true })
        .fill(credentials[`CADENCE_TEST_EMAIL_${account}`]);
      await page
        .getByLabel("PASSWORD", { exact: true })
        .fill(credentials[`CADENCE_TEST_PASSWORD_${account}`]);
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Settings", exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Settings", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Your account" }),
      ).toBeVisible();
      await expect(page.locator(".account-panel")).toContainText(
        credentials[`CADENCE_TEST_EMAIL_${account}`],
      );
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Sign In", exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Sign In", exact: true }),
      ).toBeVisible();
    }
  } finally {
    for (const { client, preferences } of temporary.reverse()) {
      if (!preferences.onboardingDone) {
        const current = await client.rpc("cadence_snapshot");
        if (current.error) throw current.error;
        const restore = await client.rpc("cadence_apply_changes", {
          expected_revision: current.data.revision,
          changes: { preferences },
        });
        if (restore.error) throw restore.error;
      }
      await client.auth.signOut({ scope: "local" });
    }
  }
});

test("live Excel preview, atomic import, refresh, priorities, and two-user isolation", async ({
  page,
}) => {
  const required = [
    "CADENCE_TEST_EMAIL_A",
    "CADENCE_TEST_PASSWORD_A",
    "CADENCE_TEST_EMAIL_B",
    "CADENCE_TEST_PASSWORD_B",
  ];
  test.skip(
    required.some((name) => !credentials[name]),
    "Two confirmed test accounts in .env.test.local are required.",
  );
  const publicConfig = Object.fromEntries(
    fs
      .readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      }),
  );
  const client = () =>
    createClient(
      publicConfig.VITE_SUPABASE_URL,
      publicConfig.VITE_SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  const a = client(),
    b = client(),
    createdSkills = [];
  let userId, initial, initialB;
  async function snapshot(c) {
    const { data, error } = await c.rpc("cadence_snapshot");
    if (error) throw error;
    return data;
  }
  async function signIn(c, account) {
    const { data, error } = await c.auth.signInWithPassword({
      email: credentials[`CADENCE_TEST_EMAIL_${account}`],
      password: credentials[`CADENCE_TEST_PASSWORD_${account}`],
    });
    if (error) throw new Error(`Live test sign-in failed: ${error.message}`);
    return data.user.id;
  }
  const suffix = randomUUID().slice(0, 8),
    names = [
      `JavaScript import test ${suffix}`,
      `React.js import test ${suffix}`,
    ];
  try {
    userId = await signIn(a, "A");
    await signIn(b, "B");
    initial = await snapshot(a);
    initialB = await snapshot(b);
    expect(initial.topicImportReady).toBe(true);
    if (!initial.data.preferences.onboardingDone) {
      const { error } = await a.rpc("cadence_apply_changes", {
        expected_revision: initial.revision,
        changes: {
          preferences: { ...initial.data.preferences, onboardingDone: true },
        },
      });
      if (error) throw error;
    }
    await page.goto("/");
    await page
      .getByLabel("EMAIL", { exact: true })
      .fill(credentials.CADENCE_TEST_EMAIL_A);
    await page
      .getByLabel("PASSWORD", { exact: true })
      .fill(credentials.CADENCE_TEST_PASSWORD_A);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Settings", exact: true }),
    ).toBeVisible();
    if (
      await page
        .getByRole("button", { name: "Create my study space", exact: true })
        .isVisible()
    )
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
    await page.getByRole("button", { name: "Skills", exact: true }).click();
    for (const [index, name] of names.entries()) {
      await page
        .getByRole("button", { name: "Import Topics", exact: true })
        .click();
      await page.getByLabel("STEP 1 · SELECT SKILL").selectOption("new");
      await page.getByLabel("NEW SKILL NAME").fill(name);
      const topics =
        index === 0
          ? [
              ["Low topic", "Low"],
              ["First high topic", "High"],
              ["Second high topic", "High"],
            ]
          : [
              ["Components & Props", "High"],
              ["useState", "Medium"],
            ];
      await page
        .getByLabel("STEP 2 · UPLOAD EXCEL")
        .setInputFiles({
          name: "completed.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer: completedWorkbook(topics),
        });
      await expect(page.locator(".import-preview")).toContainText(
        `${topics.length} topics found`,
      );
      await page
        .getByRole("button", {
          name: `Import ${topics.length} Topics`,
          exact: true,
        })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const state = await snapshot(a),
        skill = state.data.skills.find((skill) => skill.name === name);
      expect(skill).toBeTruthy();
      createdSkills.push(skill.id);
      expect(
        state.data.topics
          .filter((topic) => topic.skillId === skill.id)
          .map((topic) => [topic.name, topic.priority]),
      ).toEqual(topics);
      await page.reload();
      await expect(
        page
          .locator(".skill-card")
          .filter({ has: page.getByRole("heading", { name, exact: true }) }),
      ).toContainText(`0 of ${topics.length} topics`);
    }
    const bState = await snapshot(b);
    expect(
      bState.data.skills.some((skill) => createdSkills.includes(skill.id)),
    ).toBe(false);
    expect(
      bState.data.topics.some((topic) => createdSkills.includes(topic.skillId)),
    ).toBe(false);
    const select = await b
      .from("topics")
      .select("id")
      .in("skill_id", createdSkills);
    expect(select.error).toBeNull();
    expect(select.data).toEqual([]);
    const { data: rows, error } = await b
      .from("topics")
      .update({ priority: "Low" })
      .eq("skill_id", createdSkills[0])
      .select("id");
    expect(error).toBeNull();
    expect(rows).toEqual([]);
    if (!initialB.data.preferences.onboardingDone) {
      const current = await snapshot(b);
      const { error } = await b.rpc("cadence_apply_changes", {
        expected_revision: current.revision,
        changes: {
          preferences: { ...current.data.preferences, onboardingDone: true },
        },
      });
      if (error) throw error;
    }
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page
      .getByLabel("EMAIL", { exact: true })
      .fill(credentials.CADENCE_TEST_EMAIL_B);
    await page
      .getByLabel("PASSWORD", { exact: true })
      .fill(credentials.CADENCE_TEST_PASSWORD_B);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.getByRole("button", { name: "Skills", exact: true }).click();
    for (const name of names)
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toHaveCount(0);
  } finally {
    // Recover IDs by our unique test names even if a UI assertion failed after save.
    if (userId) {
      const state = await snapshot(a);
      const owned = state.data.skills
        .filter((skill) => names.includes(skill.name))
        .map((skill) => skill.id);
      if (owned.length) {
        const { error } = await a
          .from("skills")
          .delete()
          .eq("user_id", userId)
          .in("id", owned);
        if (error)
          throw new Error(`Live Excel cleanup failed: ${error.message}`);
      }
      if (initial && !initial.data.preferences.onboardingDone) {
        const latest = await snapshot(a);
        const { error } = await a.rpc("cadence_apply_changes", {
          expected_revision: latest.revision,
          changes: { preferences: initial.data.preferences },
        });
        if (error) throw error;
      }
    }
    if (initialB && !initialB.data.preferences.onboardingDone) {
      const latest = await snapshot(b);
      const { error } = await b.rpc("cadence_apply_changes", {
        expected_revision: latest.revision,
        changes: { preferences: initialB.data.preferences },
      });
      if (error) throw error;
    }
    await Promise.all([a, b].map((c) => c.auth.signOut({ scope: "local" })));
  }
});
