import { usePanelTheme } from './PanelTheme';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '../../services/auth';
import { useAppLocale, type AppLocale } from '../../services/locale';
import { FeatureActionButton, ui } from './FeatureUI';
// The app language: every screen, and the Weekly/Monthly reflections (server: weeklyReportLocale),
// follow the owner's preferredLocale, saved through the owner-only PUT /users/:id/profile.
const LABELS:Record<AppLocale,string>={en:'English','zh-Hans':'简体中文'};
const COPY={en:{current:'App and reflection language',failed:'The language was not saved. Please try again.'},
 'zh-Hans':{current:'应用和回顾使用的语言',failed:'语言没有保存成功，请再试一次。'}};
export function ReportLanguageSettings() {
 const {session,updateLocale}=useAuth(); const owner=session?.user.id;
 const locale=useAppLocale(), copy=COPY[locale];
 const {theme}=usePanelTheme();
 const [busy,setBusy]=useState(false),[status,setStatus]=useState('');
 async function save(next:AppLocale){if(!owner||busy||next===locale)return;setBusy(true);setStatus('');try{await updateLocale(next);}catch{setStatus(copy.failed);}finally{setBusy(false);}}
 return <View style={{gap:8}}><Text style={[ui.text,{color:theme.text}]}>{copy.current}</Text>
  <View style={ui.row}>{(['en','zh-Hans'] as const).map(l=><View key={l}><FeatureActionButton secondary={l!==locale} title={l===locale?`✓ ${LABELS[l]}`:LABELS[l]} disabled={busy||!owner||l===locale} onPress={()=>void save(l)}/></View>)}</View>
  {status?<Text accessibilityRole="alert" style={[ui.caption,{color:theme.muted}]}>{status}</Text>:null}</View>;
}
