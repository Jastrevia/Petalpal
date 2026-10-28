import { useState, type ReactNode } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { useAppLocale } from '../../services/locale';
import { openHelpFeedback } from '../feedback/helpFeedbackBus';
import { FeatureLinkRow, ui } from './FeatureUI';
import { usePanelTheme } from './PanelTheme';
import { CommunityGuidelines } from './CommunityGuidelines';
import { DeleteAccountSettings } from './DeleteAccountSettings';
const COPY={en:{title:'Privacy & support',help:'Send feedback',privacy:'Privacy Policy',terms:'Terms of Use',deletion:'Account & Data Deletion',problem:'Report a problem',guidelines:'Community Guidelines',deleteAccount:'Delete account',groupHelp:'Get help',groupRules:'Rules & policies',groupAccount:'Account',
  support:'Contact support',mail:'Opening your email app to write to contact@jastrevia.com…',emergency:"PetalPal isn't an emergency service. If you or someone else is in danger, contact local emergency services."},
 'zh-Hans':{title:'隐私与帮助',help:'发送反馈',privacy:'隐私政策',terms:'使用条款',deletion:'账号与数据删除',problem:'报告问题',guidelines:'社区准则',deleteAccount:'删除账号',groupHelp:'获取帮助',groupRules:'规则与政策',groupAccount:'账号',
  support:'联系客服',mail:'正在打开邮件应用，写信到 contact@jastrevia.com…',emergency:'PetalPal 不是紧急服务。如果你或他人有危险，请联系当地紧急服务。'}};
// On the web a page opens in a new tab, so the Garden stays where it was.
async function openPolicy(url:string|undefined,setStatus:(value:string)=>void){if(!url){setStatus('This policy URL is awaiting publication. Contact contact@jastrevia.com.');return;}
 try{if(Platform.OS==='web'&&/^https?:/.test(url)&&typeof window!=='undefined'){window.open(url,'_blank','noopener');return;}await Linking.openURL(url);}catch{setStatus('Unable to open the link. Please contact contact@jastrevia.com.');}}
// Settings: the published policies, support and a way to report a problem, as buttons. The policy
// text itself lives on the published pages, not in the panel.
// In Me (`account`), the Community Guidelines and account deletion unfold in this same list; the
// deletion row replaces the separate deletion-policy link (the policy is linked inside it).
// `onLeave` closes the panel around this list first, so Help & Feedback opens on top of the Garden.
export function PrivacyAndSupport({account=false,onLeave}:{account?:boolean;onLeave?:()=>void}={}){
 const [status,setStatus]=useState('');
 const [unfolded,setUnfolded]=useState<'guidelines'|'delete'|null>(null);
 const copy=COPY[useAppLocale()];
 const titleColor=usePanelTheme().theme.text;
 const open=(url?:string)=>openPolicy(url,setStatus);
 const feedback=()=>{onLeave?.();setTimeout(openHelpFeedback,onLeave?250:0);};
 const support=()=>{setStatus(copy.mail);void open('mailto:contact@jastrevia.com');};
 const toggle=(item:'guidelines'|'delete')=>setUnfolded(unfolded===item?null:item);
 // In Me: three groups, most used first, the one that cannot be undone last and on its own.
 if(account) return <View style={{gap:6}}><Text accessibilityRole="header" style={[ui.title,{color:titleColor}]}>{copy.title}</Text>
  <Group label={copy.groupHelp}>
   <FeatureLinkRow first title={copy.help} onPress={feedback}/>
   <FeatureLinkRow title={copy.support} onPress={support}/>
  </Group>
  {status?<Text accessibilityRole="alert" style={[ui.text,{color:titleColor}]}>{status}</Text>:null}
  <Group label={copy.groupRules}>
   <FeatureLinkRow first title={copy.guidelines} expanded={unfolded==='guidelines'} onPress={()=>toggle('guidelines')}/>
   {unfolded==='guidelines'?<Unfolded><CommunityGuidelines embedded/></Unfolded>:null}
   <FeatureLinkRow title={copy.privacy} onPress={()=>void open(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL)}/>
   <FeatureLinkRow title={copy.terms} onPress={()=>void open(process.env.EXPO_PUBLIC_TERMS_URL)}/>
  </Group>
  <Group label={copy.groupAccount}>
   <FeatureLinkRow first danger title={copy.deleteAccount} expanded={unfolded==='delete'} onPress={()=>toggle('delete')}/>
   {unfolded==='delete'?<Unfolded><DeleteAccountSettings embedded onPolicy={()=>void open(process.env.EXPO_PUBLIC_DELETION_URL)}/></Unfolded>:null}
  </Group>
  <Text style={ui.caption}>{copy.emergency}</Text></View>;
 return <View style={{gap:6}}><Text accessibilityRole="header" style={[ui.title,{color:titleColor}]}>{copy.title}</Text>
 <View>
 <FeatureLinkRow first title={copy.help} onPress={feedback}/>
 <FeatureLinkRow title={copy.privacy} onPress={()=>void open(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL)}/>
 <FeatureLinkRow title={copy.terms} onPress={()=>void open(process.env.EXPO_PUBLIC_TERMS_URL)}/>
 <FeatureLinkRow title={copy.deletion} onPress={()=>void open(process.env.EXPO_PUBLIC_DELETION_URL)}/>
 <FeatureLinkRow title={copy.problem} onPress={()=>{setStatus(copy.mail);void open(problemReportUrl());}}/>
 <FeatureLinkRow title={copy.support} onPress={support}/>
 </View>
 {status?<Text accessibilityRole="alert" style={[ui.text,{color:titleColor}]}>{status}</Text>:null}
 <Text style={ui.caption}>{copy.emergency}</Text></View>;
}

function Group({label,children}:{label:string;children:ReactNode}){
 return <View style={{marginTop:10}}><Text style={[ui.caption,{fontWeight:'700',letterSpacing:.6,textTransform:'uppercase',marginBottom:2}]}>{label}</Text>{children}</View>;
}
function Unfolded({children}:{children:ReactNode}){return <View style={{paddingBottom:12,paddingHorizontal:2}}>{children}</View>;}

// A bug report by email, with what helps us reproduce it filled in. Nothing private is attached.
export function problemReportUrl(now=new Date()){
 const device=Platform.OS==='web'&&typeof navigator!=='undefined'?navigator.userAgent:`${Platform.OS} ${String(Platform.Version)}`;
 const body=['What happened:','','What you expected:','','Steps to make it happen again:','1.','',
  '— Please don\'t include passwords or private entries.',`Device: ${device}`,`Time: ${now.toISOString()}`].join('\n');
 return `mailto:contact@jastrevia.com?subject=${encodeURIComponent('PetalPal problem report')}&body=${encodeURIComponent(body)}`;
}

// Compact sign-in footer: links plus a one-line safety note; the full notice
// stays one tap away here and in the in-app Privacy & support panel.
export function PrivacyLinks(){
 const [expanded,setExpanded]=useState(false);
 const [status,setStatus]=useState('');
 const link={color:'#365b42',textDecorationLine:'underline' as const};
 if(expanded) return <View style={{gap:10}}><PrivacyAndSupport/>
  <Text accessibilityRole="button" style={[ui.caption,link]} onPress={()=>setExpanded(false)}>Hide privacy & support</Text></View>;
 return <View style={{gap:6}}>
  <Text style={[ui.caption,{textAlign:'center'}]}>By continuing, you agree to the{' '}
   <Text accessibilityRole="link" style={link} onPress={()=>void openPolicy(process.env.EXPO_PUBLIC_TERMS_URL,setStatus)}>Terms of Use</Text>{' '}and{' '}
   <Text accessibilityRole="link" style={link} onPress={()=>void openPolicy(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL,setStatus)}>Privacy Policy</Text>.
   {' '}PetalPal is not a therapist or emergency service.</Text>
  <Text accessibilityRole="button" style={[ui.caption,link,{textAlign:'center'}]} onPress={()=>setExpanded(true)}>Privacy & support</Text>
  {status?<Text accessibilityRole="alert" style={ui.caption}>{status}</Text>:null}</View>;
}
