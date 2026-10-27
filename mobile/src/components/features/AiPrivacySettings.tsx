import { useEffect, useState } from 'react';
import { Text, View, Switch } from 'react-native';
import { useAuth } from '../../services/auth';
import { apiRequest } from '../../services/api';
import { useAppLocale } from '../../services/locale';
import { FeatureActionButton, ui } from './FeatureUI';
import { usePanelTheme } from './PanelTheme';
type Consent={aiProcessing:boolean;personalization:boolean;memoryEnabled:boolean};
type ConsentRecord=Consent&{createdAt?:string;updatedAt?:string};
// The API returns the whole consent record; requests and state carry only the three flags (PUT rejects other fields).
const flags=(c:Consent):Consent=>({aiProcessing:c.aiProcessing===true,personalization:c.personalization===true,memoryEnabled:c.memoryEnabled===true});
// A record that was never saved (created on first read): the switches start on, but nothing is
// granted until the owner taps Save.
const undecided=(c:ConsentRecord)=>Boolean(c.createdAt&&c.createdAt===c.updatedAt)&&!c.aiProcessing;
type Disclosure={version:string;explanation:string;retention:string;features:{feature:string;processor:string;configured:boolean}[]};

const COPY={
 en:{title:'AI processing & privacy',loading:'Loading the AI disclosure. Optional AI cannot be enabled until this is available.',
  switches:['AI Processing','Personalization','Long-term Memory'],configured:'configured',unavailable:'unavailable',
  save:'Save my AI choices',withdraw:'Withdraw all AI consent',saved:'Privacy choices saved.',
  suggested:'AI is on by default so your Events can be analysed. Tap Save to confirm, or turn it off.',
  feature:(f:string)=>f,processor:(p:string)=>p,explanation:(t:string)=>t,retention:(t:string)=>t},
 'zh-Hans':{title:'AI 处理与隐私',loading:'正在加载 AI 说明。说明加载完成前无法开启 AI。',
  switches:['AI 处理','个性化','长期记忆'],configured:'已启用',unavailable:'不可用',
  save:'保存我的 AI 选择',withdraw:'撤回全部 AI 授权',saved:'隐私选择已保存。',
  suggested:'AI 默认开启，这样才能分析你的事件。点「保存」确认，或者把它关掉。',
  feature:(f:string)=>ZH_FEATURES[f]??f,processor:(p:string)=>ZH_PROCESSORS[p]??p,
  explanation:()=>'开启「AI 处理」后，事件文字和你选择的心情会发送给下列服务，用于给出情绪建议；你提交的录音会发送去转成文字。「个性化」允许用符合条件的事件生成个性化的回顾。「长期记忆」允许保存事件摘要和向量，并在周报、月报中使用。回顾请求可能包含事件片段、日期、心情标签和由此生成的记忆。日记中打的字和日记照片不会进入事件记忆和回顾。用语音写日记时，录音同样会被发送去转文字；你也可以直接打字。显示为不可用的功能，即使授权也不会启用；显示已启用也不保证服务一直可用。',
  retention:()=>'处理可能在你所在国家以外进行。服务商的数据保留、处理地区和合同条款仍需运营方核实；这里不承诺零保留或不用于训练。撤回授权后，之后不会再发送新的请求，未完成的结果会被丢弃，但已经发出的请求无法撤回，服务商那里的副本也不会自动删除。关闭「长期记忆」会从数据库中移除生成的记忆和已保存的回顾；原始事件和日记会保留，直到你自己删除。'},
};
const ZH_FEATURES:Record<string,string>={
 'Event emotion labels':'事件情绪标签','Voice transcription (including voice used while writing a Journal)':'语音转文字（包括写日记时用的语音）',
 'Event memory embeddings':'事件记忆向量','Weekly reflection narrative':'周报正文','Monthly reflection narrative':'月报正文',
 'Fairy Moments captions (no Events or Journals are sent)':'小花仙朋友圈文案（不会发送事件或日记）',
};
const ZH_PROCESSORS:Record<string,string>={'Cloudflare Workers AI':'Cloudflare Workers AI','Anthropic through Cloudflare AI Gateway':'Anthropic（经 Cloudflare AI Gateway）'};

export function AiPrivacySettings() {
 const {session}=useAuth(); const owner=session?.user.id;
 const copy=COPY[useAppLocale()];
 const {theme}=usePanelTheme();
 const [value,setValue]=useState<Consent>({aiProcessing:false,personalization:false,memoryEnabled:false});
 const [suggested,setSuggested]=useState(false);
 const [disclosure,setDisclosure]=useState<Disclosure|null>(null),[busy,setBusy]=useState(true),[status,setStatus]=useState('');
 useEffect(()=>{let active=true;if(!owner)return;Promise.all([apiRequest<ConsentRecord>(`/users/${owner}/ai-consent`),apiRequest<Disclosure>('/ai/disclosure')]).then(([c,d])=>{if(!active)return;
  const fresh=undecided(c);setSuggested(fresh);setValue(fresh?{aiProcessing:true,personalization:true,memoryEnabled:true}:flags(c));setDisclosure(d);}).catch(e=>{if(active)setStatus(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[owner]);
 async function save(next:Consent){if(!owner || (!disclosure && (next.aiProcessing||next.personalization||next.memoryEnabled)))return;setBusy(true);setStatus('');try{setValue(flags(await apiRequest<Consent>(`/users/${owner}/ai-consent`,'PUT',{...flags(next),...(disclosure?{disclosureVersion:disclosure.version}:{})})));setSuggested(false);setStatus(copy.saved);}catch(e){setStatus((e as Error).message);}finally{setBusy(false);}}
 return <View style={{gap:12}}>
 {disclosure ? <><Text style={ui.text}>{copy.explanation(disclosure.explanation)}</Text>{disclosure.features.map(f=><Text key={f.feature} style={ui.caption}>{copy.feature(f.feature)}: {copy.processor(f.processor)} — {f.configured?copy.configured:copy.unavailable}</Text>)}<Text style={ui.text}>{copy.retention(disclosure.retention)}</Text></>:<Text style={ui.text}>{copy.loading}</Text>}
 {(['aiProcessing','personalization','memoryEnabled'] as const).map((key,i)=><View key={key} style={ui.row}><Text style={[ui.text,{flex:1,color:theme.text}]}>{copy.switches[i]}</Text><Switch accessibilityLabel={copy.switches[i]} value={value[key]} disabled={busy||!disclosure||(key!=='aiProcessing'&&!value.aiProcessing)||(key==='memoryEnabled'&&!value.personalization)} onValueChange={enabled=>setValue(v=>({...v,[key]:enabled,...(!enabled&&key==='aiProcessing'?{personalization:false,memoryEnabled:false}:{}),...(!enabled&&key==='personalization'?{memoryEnabled:false}:{})}))}/></View>)}
 {suggested?<Text style={ui.caption}>{copy.suggested}</Text>:null}
 <FeatureActionButton title={copy.save} disabled={busy||!disclosure} onPress={()=>void save(value)}/>
 <FeatureActionButton secondary title={copy.withdraw} disabled={busy} onPress={()=>void save({aiProcessing:false,personalization:false,memoryEnabled:false})}/>
 {status?<Text accessibilityRole="alert" style={ui.text}>{status}</Text>:null}</View>;
}
const REPORT_COPY={
 en:{report:'Report AI output',note:'Only the output reference and reason are sent. Your private text is not attached.',
  received:'Report received. Our team reviews every report; there is no separate result message.',
  categories:{HARASSMENT:'Harassment',HATE_SPEECH:'Hate speech',SELF_HARM:'Self-harm',PRIVACY:'Privacy',OTHER:'Other'} as Record<string,string>},
 'zh-Hans':{report:'举报 AI 内容',note:'只会发送这条内容的编号和举报原因，不会附上你的私人文字。',
  received:'已收到举报。我们会查看每一条举报，不会另外通知结果。',
  categories:{HARASSMENT:'骚扰',HATE_SPEECH:'仇恨言论',SELF_HARM:'自我伤害',PRIVACY:'隐私',OTHER:'其他'} as Record<string,string>},
};
export function AiOutputReport({kind,outputId}:{kind:string;outputId:string}) {
 const copy=REPORT_COPY[useAppLocale()];
 const [open,setOpen]=useState(false),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 return <View style={{gap:8}}><FeatureActionButton secondary title={copy.report} onPress={()=>setOpen(!open)} disabled={busy}/>
 {open?<><Text style={ui.text}>{copy.note}</Text>{['HARASSMENT','HATE_SPEECH','SELF_HARM','PRIVACY','OTHER'].map(category=><FeatureActionButton key={category} secondary title={copy.categories[category]} disabled={busy} onPress={async()=>{setBusy(true);try{await apiRequest('/ai-output-reports','POST',{kind,outputId,category});setStatus(copy.received);setOpen(false);}catch(e){setStatus((e as Error).message);}finally{setBusy(false);}}}/>)}</>:null}
 {status?<Text accessibilityRole="alert" style={ui.text}>{status}</Text>:null}</View>;
}
