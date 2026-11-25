import { elapsedMs, type RunState } from "./run-state";
import type { LessonPlan, TaskCard } from "./schema";
export function clockMinute(run: RunState | null, now: number): number | undefined {
  return run ? Math.floor(elapsedMs(run,now)/60000) : undefined;
}
export function practiceUnlocked(plan:LessonPlan,groupId:string,run:RunState|null,now:number):boolean {
  if(!run)return true;
  const first=plan.timeline.filter((s)=>s.groupId===groupId&&s.mode==="with_teacher").sort((a,b)=>a.startMin-b.startMin)[0];
  return !!first && elapsedMs(run,now)>=first.endMin*60000;
}
export function cardUnlocked(plan:LessonPlan,groupId:string,card:TaskCard,run:RunState|null,now:number):boolean {
  return card.purpose==="review"||practiceUnlocked(plan,groupId,run,now);
}
