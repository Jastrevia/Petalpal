import { Text, View } from 'react-native';
import { GENERAL_SUPPORT, immediateSupportHint } from '../../services/emotionalSafety';
import { useAppLocale } from '../../services/locale';
import { ui } from './FeatureUI';
const GENERAL_SUPPORT_ZH='PetalPal 用来记录和回看心情，不提供医疗建议或紧急救援。如果你或他人正处于危险中，请联系当地紧急服务，或身边能马上帮忙的人。';
export function EmotionalSafetyNote({text=''}:{text?:string}) {
 const hint=immediateSupportHint(text);
 const zh=useAppLocale()==='zh-Hans';
 return <View style={{gap:8}}><Text style={ui.caption}>{zh?GENERAL_SUPPORT_ZH:GENERAL_SUPPORT}</Text>{hint?<Text accessibilityRole="alert" style={ui.text}>{hint}</Text>:null}</View>;
}
