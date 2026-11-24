import { expect, it } from "vitest";
import { lessonReport, csvCell, reportCsv } from "@/lib/lesson-report";
import { demoFor } from "@/lib/demo";
import { demoClass } from "@/lib/demo-class";
const plan=demoFor("ru");
it("empty classes do not invent successes or advice",()=>{
  expect(lessonReport(plan,[]).every((g)=>g.pupils===0&&g.solved===0&&g.advice===null)).toBe(true);
});
it("counts failed attempts even after an eventual correct answer",()=>{
  const students=demoClass(plan,42,10000,0);const s=students[0];const c=plan.groups[0].cards[0];
  s.cards[c.id]={status:"correct",attempts:4,hints:1,lastAnswer:"answer"};
  const report=lessonReport(plan,students)[0];
  expect(report.solved).toBe(1);expect(report.advice).toMatchObject({number:1,wrong:1,attempted:1,rate:1});
});
it("deduplicates observed and current help requests",()=>{
  const students=demoClass(plan,42,10000,70);const s=students.find((s)=>s.needsHelp)!;
  const row={studentId:s.id,name:s.name,groupId:s.groupId,cardId:s.helpCard!};
  expect(lessonReport(plan,students,[row,row]).find((g)=>g.groupId===s.groupId)?.requests).toHaveLength(1);
});
it("quotes CSV and neutralizes spreadsheet formulas",()=>{
  expect(csvCell('a,"b"')).toBe('"a,""b"""');
  for(const s of ['=HYPERLINK("bad")',' +1','\t@SUM(A1)','-1'])expect(csvCell(s).startsWith('"\'')).toBe(true);
  const rows=demoClass(plan,42,10000,70); rows[0].name='=1+1';
  const csv=reportCsv(plan,rows,['name','grade','solved','hints','help','demo']);
  expect(csv.startsWith('\uFEFF')).toBe(true);expect(csv).toContain('"\'=1+1"');
});
