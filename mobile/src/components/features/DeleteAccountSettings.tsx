import {useState} from 'react';
import {Text,View} from 'react-native';
import {useAuth} from '../../services/auth';
import {useAppLocale} from '../../services/locale';
import {FeatureActionButton,ui} from './FeatureUI';
import { usePanelTheme } from './PanelTheme';
const COPY={en:{title:'Delete Account',what:'Delete your account, private Journals and photos, Events, memories, embeddings, reflections, Garden and social content. This cannot be undone. Minimal security/cost records, deletion retry records, backups and provider copies may remain under their retention policies. Other people’s copies cannot be recalled.',
  confirm:'Confirm permanent deletion. You must have signed in within the last five minutes. If asked, sign out and sign in again, then return here. A network failure may require retrying or contacting support.',
  deleting:'Deleting…',delete:'Permanently delete my account',cancel:'Cancel deletion',policy:'Read the full deletion policy'},
 'zh-Hans':{title:'删除账号',what:'删除你的账号、私人日记和照片、事件、记忆、向量、回顾、花园和社交内容。此操作无法撤销。少量安全与费用记录、删除重试记录、备份和服务商副本可能会按各自的保留政策继续保存一段时间。别人那里的副本无法收回。',
  confirm:'确认永久删除。你需要在最近五分钟内登录过；如果被要求，请先退出再重新登录，然后回到这里。网络出错时可能需要重试或联系客服。',
  deleting:'正在删除…',delete:'永久删除我的账号',cancel:'取消删除',policy:'查看完整的删除政策'}};
// `embedded`: inside the Me support list (its row is the title); `onPolicy` opens the published policy.
export function DeleteAccountSettings({embedded=false,onPolicy}:{embedded?:boolean;onPolicy?:()=>void}={}){
 const {deleteAccount}=useAuth();const copy=COPY[useAppLocale()];const titleColor=usePanelTheme().theme.text;const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <View style={{gap:10}}>{embedded?null:<Text accessibilityRole="header" style={[ui.title,{color:titleColor}]}>{copy.title}</Text>}
 <Text style={ui.text}>{copy.what}</Text>
 {onPolicy?<Text accessibilityRole="link" onPress={onPolicy} style={[ui.caption,{color:titleColor,textDecorationLine:'underline'}]}>{copy.policy}</Text>:null}
 <FeatureActionButton secondary title={copy.title} disabled={busy} onPress={()=>setConfirm(true)}/>
 {confirm?<><Text style={ui.text}>{copy.confirm}</Text>
 <FeatureActionButton title={busy?copy.deleting:copy.delete} disabled={busy} onPress={async()=>{setBusy(true);setError('');try{await deleteAccount();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}/>
 <FeatureActionButton secondary title={copy.cancel} disabled={busy} onPress={()=>setConfirm(false)}/></>:null}
 {error?<Text accessibilityRole="alert" style={ui.text}>{error}</Text>:null}</View>;
}
