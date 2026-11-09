import { Canvas, useCanvasRef, type CanvasProps } from '@shopify/react-native-skia';
import { useEffect, useImperativeHandle } from 'react';
import { View } from 'react-native';
import { installFrameGate, noteGardenTouch, removeFrameGate } from './gardenNativeFrames';
// Native remains on the upstream Canvas; Web quality/cache choices do not apply.
export type GardenCanvasProps = Pick<CanvasProps, 'children' | 'style' | 'ref'> & { active: boolean };
export default function GardenCanvas({ active: _active, ref, style, ...props }: GardenCanvasProps) {
  const canvas = useCanvasRef();
  useImperativeHandle(ref, () => canvas.current!, [canvas]);
  useEffect(() => {
    const id = canvas.current?.getNativeId();
    if (id === undefined) return;
    installFrameGate(id);
    return removeFrameGate;
  }, [canvas]);
  return <View style={style} onTouchStart={() => noteGardenTouch(true)} onTouchEnd={() => noteGardenTouch(false)} onTouchCancel={() => noteGardenTouch(false)}>
    <Canvas {...props} ref={canvas} style={{ flex: 1 }} />
  </View>;
}
