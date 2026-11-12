import type { ModalProps } from 'react-native';

// The app turns freely between portrait and landscape (app.json "orientation": "default"). iOS shows a
// React Native <Modal> in portrait only unless the Modal itself lists more, which on a phone held
// sideways would turn the sheet a quarter turn away from the screen behind it. Every <Modal> in the
// app passes this list (test/landscapeOrientation.test.mjs checks that none is missed).
export const MODAL_ORIENTATIONS: NonNullable<ModalProps['supportedOrientations']> = ['portrait', 'portrait-upside-down', 'landscape'];

// The Treehouse (bookhouse) is the one screen that stays upright (see app/_layout.tsx); the sheets it
// opens stay upright with it, or iOS would turn a sheet sideways over an upright screen.
export const PORTRAIT_MODAL_ORIENTATIONS: NonNullable<ModalProps['supportedOrientations']> = ['portrait'];
