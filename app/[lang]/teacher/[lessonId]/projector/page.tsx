import {Suspense} from "react";
import {notFound} from "next/navigation";
import {ProjectorScreen} from "@/components/ProjectorScreen";
import {getLesson} from "@/lib/store";
import {demoFor} from "@/lib/demo";
import {isLocale} from "@/lib/i18n";
export default function Page({params}:PageProps<"/[lang]/teacher/[lessonId]/projector">){
 return <Suspense fallback={<div className="min-h-dvh bg-white"/>}><Content params={params}/></Suspense>;
}
async function Content({params}:{params:PageProps<"/[lang]/teacher/[lessonId]/projector">["params"]}){
 const {lang,lessonId}=await params;if(!isLocale(lang))notFound();
 if(lessonId==="demo")return <ProjectorScreen plan={demoFor(lang)} lessonId={lessonId} lang={lang}/>;
 const lesson=await getLesson(lessonId);if(!lesson)notFound();
 return <ProjectorScreen plan={lesson.plan} lessonId={lessonId} joinCode={lesson.joinCode} lang={lang}/>;
}
