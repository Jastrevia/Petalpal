import AsyncStorage from '@react-native-async-storage/async-storage';

// Per-flower choices made when planting an Event's flower: whether its Event is shown to friends
// (off by default) and whether it was planted without its AI analysis. Kept on this device until
// the server stores them (no backend route yet).
const KEY = 'petalpal.flowers.choices.v1';
export type FlowerChoice = { showToFriends?: boolean; withoutAnalysis?: boolean };

async function readAll(): Promise<Record<string, FlowerChoice>> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) || '{}') ?? {}; } catch { return {}; }
}
export async function loadFlowerChoice(flowerId: string): Promise<FlowerChoice> {
  return (await readAll())[flowerId] ?? {};
}
export async function saveFlowerChoice(flowerId: string, choice: FlowerChoice) {
  const all = await readAll();
  all[flowerId] = { ...all[flowerId], ...choice };
  await AsyncStorage.setItem(KEY, JSON.stringify(all));
}
