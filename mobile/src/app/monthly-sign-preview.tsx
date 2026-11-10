import { Link, Redirect, router } from 'expo-router';
import { Text } from 'react-native';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import GardenScene from '@/components/garden/GardenScene';
import { signPavilionHref } from '@/components/garden/month-signs/signPlacement';
export default function MonthlySignPreview() {
 useEffect(()=>{if(__DEV__)void SplashScreen.hideAsync();},[]);
 if(!__DEV__)return <Redirect href="/"/>;
 return <GestureHandlerRootView style={{flex:1}}>
  <GardenScene mode="development" initialWaterfallVersion="v2" enableFairyWalk showDevControls={false}
    onOpenReflection={month=>router.push(month?signPavilionHref(month):'/reflection')}/>
  <Link href="/" style={{position:'absolute',left:12,bottom:16,padding:10,backgroundColor:'#e3d5bc',zIndex:10001}}><Text>Open normal Garden</Text></Link>
 </GestureHandlerRootView>;
}
