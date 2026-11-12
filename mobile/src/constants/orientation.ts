import type { ModalProps } from 'react-native';

// The app turns freely between portrait and landscape (app.json "orientation": "default"). iOS shows a
// React Native <Modal> in portrait only unless the Modal itself lists more, which on a phone held
// sideways would turn the sheet a quarter turn away from the screen behind it. Every <Modal> in the
// app passes this list (test/landscapeOrientation.test.mjs checks that none is missed).
export const MODAL_ORIENTATIONS: NonNullable<ModalProps['supportedOrientations']> = ['portrait', 'portrait-upside-down', 'landscape'];
