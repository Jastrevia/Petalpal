import { useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { useAppLocale } from '../../services/locale';
import { openHelpFeedback } from '../feedback/helpFeedbackBus';
import { FeatureLinkRow, ui } from './FeatureUI';
import { usePanelTheme } from './PanelTheme';
const COPY={en:{title:'Privacy & support',help:'Help & Feedback',privacy:'Privacy Policy',terms:'Terms of Use',deletion:'Account & Data Deletion',problem:'Report a problem',
  support:'Contact support',emergency:"PetalPal isn't an emergency service. If you or someone else is in danger, contact local emergency services."},
 'zh-Hans':{title:'隐私与帮助',help:'帮助与反馈',privacy:'隐私政策',terms:'使用条款',deletion:'账号与数据删除',problem:'报告问题',
  support:'联系客服',emergency:'PetalPal 不是紧急服务。如果你或他人有危险，请联系当地紧急服务。'}};
async function openPolicy(url:string|undefined,setStatus:(value:string)=>void){if(!url){setStatus('This policy URL is awaiting publication. Contact contact@jastrevia.com.');return;}try{await Linking.openURL(url);}catch{setStatus('Unable to open the link. Please contact contact@jastrevia.com.');}}
// Settings: the published policies, support and a way to report a problem, as buttons. The policy
// text itself lives on the published pages, not in the panel.
export function PrivacyAndSupport(){
 const [status,setStatus]=useState('');
 const copy=COPY[useAppLocale()];
 const titleColor=usePanelTheme().theme.text;
 const open=(url?:string)=>openPolicy(url,setStatus);
 return <View style={{gap:6}}><Text accessibilityRole="header" style={[ui.title,{color:titleColor}]}>{copy.title}</Text>
 <View>
 <FeatureLinkRow first title={copy.help} onPress={openHelpFeedback}/>
 <FeatureLinkRow title={copy.privacy} onPress={()=>void open(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL)}/>
 <FeatureLinkRow title={copy.terms} onPress={()=>void open(process.env.EXPO_PUBLIC_TERMS_URL)}/>
 <FeatureLinkRow title={copy.deletion} onPress={()=>void open(process.env.EXPO_PUBLIC_DELETION_URL)}/>
 <FeatureLinkRow title={copy.problem} onPress={()=>void open(problemReportUrl())}/>
 <FeatureLinkRow title={copy.support} onPress={()=>void open('mailto:contact@jastrevia.com')}/>
 </View>
 <Text style={ui.caption}>{copy.emergency}</Text>
 {status?<Text accessibilityRole="alert" style={ui.text}>{status}</Text>:null}</View>;
}

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
