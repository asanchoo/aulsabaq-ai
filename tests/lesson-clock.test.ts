import { expect,it } from "vitest";
import { cardUnlocked,practiceUnlocked } from "@/lib/lesson-clock";
import { demoFor } from "@/lib/demo";
const plan=demoFor("ru"),group=plan.groups[1],start=100000;
it("keeps the existing workflow when clock is absent",()=>expect(practiceUnlocked(plan,group.id,null,start)).toBe(true));
it("opens practice only after that group's explanation",()=>{
 const run={startedAt:start,pausedAt:null};
 expect(practiceUnlocked(plan,group.id,run,start+24*60000)).toBe(false);
 expect(practiceUnlocked(plan,group.id,run,start+25*60000)).toBe(true);
 expect(cardUnlocked(plan,group.id,group.cards[0],run,start)).toBe(true);
 expect(cardUnlocked(plan,group.id,group.cards[6],run,start)).toBe(false);
});
it("freezes access on pause regardless of later wall time",()=>expect(practiceUnlocked(plan,group.id,{startedAt:start,pausedAt:start+20*60000},start+100*60000)).toBe(false));
