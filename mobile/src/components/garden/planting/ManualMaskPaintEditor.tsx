import React, { useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  MaskTool,
  type MaskOffset,
} from './plantingMaskRefinement';
import { MONTH_REGION_METAS } from './plantingRegionData';
import { PARENT_LAND_ASSET_BY_MONTH } from './plantingRegionCalibration';

const BRUSH_SIZES = [10, 20, 40, 60, 100];
const OPACITIES = [0.25, 0.5, 0.75, 1.0];

const MONTH_LABELS: Record<number, string> = {
  1: '01 Jan',
  2: '02 Feb',
  3: '03 Mar',
  4: '04 Apr',
  5: '05 May',
  6: '06 Jun',
  7: '07 Jul',
  8: '08 Aug',
  9: '09 Sep',
  10: '10 Oct',
  11: '11 Nov',
  12: '12 Dec',
};

const MONTH_NAMES: Record<number, string> = {
  1: 'January',
  2: 'February',
  3: 'March',
  4: 'April',
  5: 'May',
  6: 'June',
  7: 'July',
  8: 'August',
  9: 'September',
  10: 'October',
  11: 'November',
  12: 'December',
};

export type PaintInteractionMode = 'paint' | 'move' | 'camera';

interface Props {
  selectedMonth: number;
  tool: MaskTool;
  brushSize: number;
  interactionMode: PaintInteractionMode;
  maskOffset: MaskOffset;
  isMovingMask: boolean;
  onNudgeOffset: (axis: 'offsetX' | 'offsetY', amount: number) => void;
  opacity: number;
  showBaseMask: boolean;
  showAdditions: boolean;
  showErasures: boolean;
  showFinalMask: boolean;
  canUndo: boolean;
  canRedo: boolean;
  strokeCount: number;
  onSelectMonth?: (month: number) => void;
  onChangeTool: (tool: MaskTool) => void;
  onChangeBrushSize: (size: number) => void;
  onChangeInteractionMode: (mode: PaintInteractionMode) => void;
  onChangeOpacity: (opacity: number) => void;
  onToggleShowBaseMask: () => void;
  onToggleShowAdditions: () => void;
  onToggleShowErasures: () => void;
  onToggleShowFinalMask: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearUnsaved: () => void;
  onResetToLockedBase: () => void;
  onCancel: () => void;
  onSaveMask: () => void;
}

export default function ManualMaskPaintEditor({
  selectedMonth,
  tool,
  brushSize,
  interactionMode,
  maskOffset,
  isMovingMask,
  onNudgeOffset,
  opacity,
  showBaseMask,
  showAdditions,
  showErasures,
  showFinalMask,
  canUndo,
  canRedo,
  strokeCount,
  onSelectMonth,
  onChangeTool,
  onChangeBrushSize,
  onChangeInteractionMode,
  onChangeOpacity,
  onToggleShowBaseMask,
  onToggleShowAdditions,
  onToggleShowErasures,
  onToggleShowFinalMask,
  onUndo,
  onRedo,
  onClearUnsaved,
  onResetToLockedBase,
  onCancel,
  onSaveMask,
}: Props) {
  const [panelPos, setPanelPos] = useState({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const [confirmReset, setConfirmReset] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // PanResponder to make panel draggable by its header
  const headerPanResponder = useRef(
    // eslint-disable-next-line react-hooks/refs -- dev editor: the responder's handlers run after render
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2;
      },
      onPanResponderGrant: () => {
        panStartRef.current = { x: panelPos.x, y: panelPos.y };
      },
      onPanResponderMove: (_, gestureState) => {
        setPanelPos({
          x: panStartRef.current.x + gestureState.dx,
          y: panStartRef.current.y + gestureState.dy,
        });
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  const meta = MONTH_REGION_METAS[selectedMonth];
  const landAsset = PARENT_LAND_ASSET_BY_MONTH[selectedMonth];
  const monthName = MONTH_NAMES[selectedMonth] || `Month ${selectedMonth}`;

  const handleSave = () => {
    onSaveMask();
    setSaveToast(`${monthName} planting mask saved.`);
    setTimeout(() => setSaveToast(null), 3500);
  };

  const handleResetConfirm = () => {
    if (confirmReset) {
      onResetToLockedBase();
      setConfirmReset(false);
      setSaveToast(`Reset ${monthName} to locked base mask.`);
      setTimeout(() => setSaveToast(null), 3000);
    } else {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 5000);
    }
  };

  return (
    <View
      style={[
        styles.panel,
        {
          transform: [
            { translateX: panelPos.x },
            { translateY: panelPos.y },
          ],
        },
      ]}
    >
      {/* Draggable Header */}
      <View style={styles.headerRow}>
        {/* eslint-disable-next-line react-hooks/refs -- dev editor: the responder's handlers run after render */}
        <View style={styles.headerDragArea} {...headerPanResponder.panHandlers}>
          <Text style={styles.dragIcon}>⠿</Text>
          <View>
            <Text style={styles.headerTitle}>MANUAL MASK EDITOR</Text>
            <Text style={styles.headerSubtitle}>
              {monthName} — {meta?.landId} ({landAsset})
            </Text>
          </View>
        </View>
        <Pressable style={styles.cancelHeaderButton} onPress={onCancel}>
          <Text style={styles.cancelHeaderButtonText}>Cancel</Text>
        </Pressable>
      </View>

      {/* Independently Scrollable Controls */}
      <ScrollView
        style={styles.scrollBody}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
      >
        {saveToast && <Text style={styles.saveToastText}>{saveToast}</Text>}

        {/* Month Selector */}
        {onSelectMonth && (
          <>
            <Text style={styles.sectionHeader}>Select Month to Paint:</Text>
            <View style={styles.monthGrid}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                const isSelected = m === selectedMonth;
                return (
                  <Pressable
                    key={m}
                    style={[styles.monthChip, isSelected && styles.monthChipActive]}
                    onPress={() => onSelectMonth(m)}
                  >
                    <Text style={[styles.monthChipText, isSelected && styles.monthChipTextActive]}>
                      {MONTH_LABELS[m]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {/* Tool Selector */}
        <Text style={styles.sectionHeader}>Tool:</Text>
        <View style={styles.segmentedRow}>
          <Pressable
            style={[styles.toolBtn, tool === 'add' && styles.toolBtnActiveAdd]}
            onPress={() => onChangeTool('add')}
          >
            <Text style={[styles.toolBtnText, tool === 'add' && styles.toolBtnTextActive]}>
              🖌️ Brush / Add
            </Text>
          </Pressable>
          <Pressable
            style={[styles.toolBtn, tool === 'remove' && styles.toolBtnActiveRemove]}
            onPress={() => onChangeTool('remove')}
          >
            <Text style={[styles.toolBtnText, tool === 'remove' && styles.toolBtnTextActive]}>
              🧹 Eraser / Remove
            </Text>
          </Pressable>
        </View>

        {/* Brush Size */}
        <View style={styles.rowBetween}>
          <Text style={styles.sectionHeader}>Brush Diameter:</Text>
          <Text style={styles.valueBadge}>{brushSize} px</Text>
        </View>
        <View style={styles.buttonRow}>
          {BRUSH_SIZES.map((sz) => (
            <Pressable
              key={sz}
              style={[styles.sizeChip, brushSize === sz && styles.sizeChipActive]}
              onPress={() => onChangeBrushSize(sz)}
            >
              <Text style={[styles.sizeChipText, brushSize === sz && styles.sizeChipTextActive]}>
                {sz}px
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.stepperRow}>
          <Pressable
            style={styles.stepperBtn}
            onPress={() => onChangeBrushSize(Math.max(4, brushSize - 5))}
          >
            <Text style={styles.stepperBtnText}>-5</Text>
          </Pressable>
          <Pressable
            style={styles.stepperBtn}
            onPress={() => onChangeBrushSize(Math.max(4, brushSize - 1))}
          >
            <Text style={styles.stepperBtnText}>-1</Text>
          </Pressable>
          <Text style={styles.stepperReadout}>{brushSize} px</Text>
          <Pressable
            style={styles.stepperBtn}
            onPress={() => onChangeBrushSize(Math.min(150, brushSize + 1))}
          >
            <Text style={styles.stepperBtnText}>+1</Text>
          </Pressable>
          <Pressable
            style={styles.stepperBtn}
            onPress={() => onChangeBrushSize(Math.min(150, brushSize + 5))}
          >
            <Text style={styles.stepperBtnText}>+5</Text>
          </Pressable>
        </View>

        {/* Interaction Mode */}
        <Text style={styles.sectionHeader}>Interaction Mode:</Text>
        <View style={styles.segmentedRow}>
          <Pressable
            style={[styles.interactBtn, interactionMode === 'paint' && styles.interactBtnActivePaint]}
            onPress={() => onChangeInteractionMode('paint')}
          >
            <Text style={[styles.interactBtnText, interactionMode === 'paint' && styles.interactBtnTextActive]}>
              🎨 Paint Mask
            </Text>
          </Pressable>
          <Pressable
            style={[styles.interactBtn, interactionMode === 'move' && styles.interactBtnActiveMove]}
            onPress={() => onChangeInteractionMode('move')}
          >
            <Text style={[styles.interactBtnText, interactionMode === 'move' && styles.interactBtnTextActive]}>
              ✋ Move Mask
            </Text>
          </Pressable>
          <Pressable
            style={[styles.interactBtn, interactionMode === 'camera' && styles.interactBtnActiveCamera]}
            onPress={() => onChangeInteractionMode('camera')}
          >
            <Text style={[styles.interactBtnText, interactionMode === 'camera' && styles.interactBtnTextActive]}>
              🔍 Pan Camera
            </Text>
          </Pressable>
        </View>

        {interactionMode === 'move' && (
          <>
            <Text style={styles.moveHint}>
              {isMovingMask ? '✋ Moving entire mask…' : '✋ Drag on the Final Mask to move it.'}
            </Text>
            <Text style={styles.sectionHeader}>Mask Offset</Text>
            {(['offsetX', 'offsetY'] as const).map((axis) => (
              <View key={axis} style={styles.offsetAxis}>
                <Text style={styles.offsetReadout}>
                  {axis === 'offsetX' ? 'X' : 'Y'}: {maskOffset[axis] >= 0 ? '+' : ''}{Number(maskOffset[axis].toFixed(2))} px
                </Text>
                <View style={styles.buttonRow}>
                  {[-10, -5, -1, 1, 5, 10].map((amount) => (
                    <Pressable key={amount} style={styles.sizeChip}
                      accessibilityLabel={`Move mask ${axis === 'offsetX' ? 'X' : 'Y'} ${amount > 0 ? '+' : ''}${amount} pixels`}
                      onPress={() => onNudgeOffset(axis, amount)}>
                      <Text style={styles.sizeChipText}>{amount > 0 ? '+' : ''}{amount}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </>
        )}

        {/* Mask Opacity */}
        <View style={styles.rowBetween}>
          <Text style={styles.sectionHeader}>Mask Opacity:</Text>
          <View style={styles.opacityGroup}>
            {OPACITIES.map((op) => (
              <Pressable
                key={op}
                style={[styles.opChip, opacity === op && styles.opChipActive]}
                onPress={() => onChangeOpacity(op)}
              >
                <Text style={[styles.opChipText, opacity === op && styles.opChipTextActive]}>
                  {Math.round(op * 100)}%
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Debug Visualization Layers */}
        <Text style={styles.sectionHeader}>Debug Display Layers:</Text>
        <View style={styles.debugGrid}>
          <Pressable
            style={[styles.debugChip, showBaseMask && styles.debugChipBaseActive]}
            onPress={onToggleShowBaseMask}
          >
            <Text style={[styles.debugChipText, showBaseMask && styles.debugChipTextActive]}>
              Base Mask (Yellow)
            </Text>
          </Pressable>
          <Pressable
            style={[styles.debugChip, showAdditions && styles.debugChipAddActive]}
            onPress={onToggleShowAdditions}
          >
            <Text style={[styles.debugChipText, showAdditions && styles.debugChipTextActive]}>
              Additions (Green)
            </Text>
          </Pressable>
          <Pressable
            style={[styles.debugChip, showErasures && styles.debugChipEraseActive]}
            onPress={onToggleShowErasures}
          >
            <Text style={[styles.debugChipText, showErasures && styles.debugChipTextActive]}>
              Erasures (Red)
            </Text>
          </Pressable>
          <Pressable
            style={[styles.debugChip, showFinalMask && styles.debugChipFinalActive]}
            onPress={onToggleShowFinalMask}
          >
            <Text style={[styles.debugChipText, showFinalMask && styles.debugChipTextActive]}>
              Final Mask (Cyan)
            </Text>
          </Pressable>
        </View>

        {/* History (Undo / Redo) */}
        <View style={styles.rowBetween}>
          <Text style={styles.sectionHeader}>History ({strokeCount} strokes):</Text>
          <View style={styles.historyGroup}>
            <Pressable
              style={[styles.historyBtn, !canUndo && styles.historyBtnDisabled]}
              disabled={!canUndo}
              onPress={onUndo}
            >
              <Text style={[styles.historyBtnText, !canUndo && styles.historyBtnTextDisabled]}>
                ↩ Undo
              </Text>
            </Pressable>
            <Pressable
              style={[styles.historyBtn, !canRedo && styles.historyBtnDisabled]}
              disabled={!canRedo}
              onPress={onRedo}
            >
              <Text style={[styles.historyBtnText, !canRedo && styles.historyBtnTextDisabled]}>
                ↪ Redo
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Action Buttons */}
        <Text style={styles.sectionHeader}>Session Actions:</Text>
        <View style={styles.buttonRow}>
          <Pressable style={styles.actionBtnSecondary} onPress={onClearUnsaved}>
            <Text style={styles.actionBtnSecondaryText}>Clear Unsaved Edits</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtnDanger, confirmReset && styles.actionBtnDangerConfirm]}
            onPress={handleResetConfirm}
          >
            <Text style={styles.actionBtnDangerText}>
              {confirmReset ? '⚠️ Tap again to confirm' : 'Reset to Locked Base'}
            </Text>
          </Pressable>
        </View>

        {/* Primary Actions: Cancel & Save */}
        <View style={styles.saveCancelRow}>
          <Pressable style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
          <Pressable style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>💾 Save Mask</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 340,
    maxWidth: '92%',
    maxHeight: '90%',
    borderRadius: 12,
    backgroundColor: '#FFFFFFFA',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 12,
    zIndex: 9999,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  headerDragArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dragIcon: {
    fontSize: 16,
    color: '#94A3B8',
    fontWeight: '700',
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '600',
  },
  cancelHeaderButton: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  cancelHeaderButtonText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '600',
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    padding: 10,
    gap: 6,
  },
  saveToastText: {
    backgroundColor: '#ECFDF5',
    color: '#059669',
    fontSize: 12,
    fontWeight: '700',
    padding: 6,
    borderRadius: 6,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    marginTop: 4,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  valueBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  segmentedRow: {
    flexDirection: 'row',
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    padding: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  toolBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  toolBtnActiveAdd: {
    backgroundColor: '#10B981',
  },
  toolBtnActiveRemove: {
    backgroundColor: '#EF4444',
  },
  toolBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  toolBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 4,
  },
  sizeChip: {
    flex: 1,
    paddingVertical: 5,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeChipActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0369A1',
  },
  sizeChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  sizeChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 2,
  },
  stepperBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  stepperBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
  },
  stepperReadout: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  interactBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  interactBtnActivePaint: {
    backgroundColor: '#8B5CF6',
  },
  interactBtnActiveCamera: {
    backgroundColor: '#3B82F6',
  },
  interactBtnActiveMove: {
    backgroundColor: '#0891B2',
  },
  moveHint: {
    fontSize: 11,
    color: '#0E7490',
    fontWeight: '600',
    marginTop: 4,
  },
  offsetAxis: {
    gap: 4,
  },
  offsetReadout: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '700',
  },
  interactBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  interactBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  opacityGroup: {
    flexDirection: 'row',
    gap: 3,
  },
  opChip: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  opChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  opChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  opChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  debugGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  debugChip: {
    width: '48.5%',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  debugChipBaseActive: {
    backgroundColor: '#FEF08A',
    borderColor: '#EAB308',
  },
  debugChipAddActive: {
    backgroundColor: '#D1FAE5',
    borderColor: '#10B981',
  },
  debugChipEraseActive: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
  },
  debugChipFinalActive: {
    backgroundColor: '#CFFAFE',
    borderColor: '#06B6D4',
  },
  debugChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  debugChipTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  historyGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  historyBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  historyBtnDisabled: {
    opacity: 0.4,
  },
  historyBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
  },
  historyBtnTextDisabled: {
    color: '#94A3B8',
  },
  actionBtnSecondary: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnSecondaryText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#334155',
  },
  actionBtnDanger: {
    flex: 1,
    backgroundColor: '#FFF1F2',
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECDD3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDangerConfirm: {
    backgroundColor: '#EF4444',
    borderColor: '#DC2626',
  },
  actionBtnDangerText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#BE123C',
  },
  saveCancelRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  saveBtn: {
    flex: 2,
    backgroundColor: '#059669',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  saveBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 4,
  },
  monthChip: {
    width: '23%',
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  monthChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  monthChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  monthChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
