import fs from 'node:fs';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

// Fill only the Topics worksheet of the supplied official workbook.
export function completedWorkbook(rows) {
  const files = unzipSync(fs.readFileSync('public/Cadence_Blank_Topic_Template.xlsx'));
  const escape = text => String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const xml = [['Topic','Priority'], ...rows].map((row,index) => `<row r="${index+1}">${row.map((value,column) =>
    `<c r="${String.fromCharCode(65+column)}${index+1}" t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`).join('')}</row>`).join('');
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']).replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${xml}</sheetData>`);
  files['xl/worksheets/sheet1.xml'] = strToU8(sheet);
  return Buffer.from(zipSync(files));
}
