import { usePanelTheme } from './PanelTheme';
import { Text, View, type TextStyle } from 'react-native';
import { GENERAL_SUPPORT, immediateSupportHint, safetyConcern } from '../../services/emotionalSafety';
import { SafetySupportInline } from './SafetySupport';
import { useAppLocale } from '../../services/locale';
import { ui } from './FeatureUI';
const GENERAL_SUPPORT_ZH='PetalPal 用来记录和回看心情，不提供医疗建议或紧急救援。如果你或他人正处于危险中，请联系当地紧急服务，或身边能马上帮忙的人。';
// `style` replaces the caption style (the Weekly 2.0 page sets it in the page's own serif).
export function EmotionalSafetyNote({text='',style}:{text?:string;style?:TextStyle}) {
 const hint=immediateSupportHint(text),concern=safetyConcern(text);
 const zh=useAppLocale()==='zh-Hans';
 const {theme}=usePanelTheme();
 return <View style={{gap:8}}><Text style={style??[ui.caption,{color:theme.muted}]}>{zh?GENERAL_SUPPORT_ZH:GENERAL_SUPPORT}</Text>{concern?<SafetySupportInline concern={concern}/>:null}{hint?<Text accessibilityRole="alert" style={[ui.text,{color:theme.text}]}>{hint}</Text>:null}</View>;
}
