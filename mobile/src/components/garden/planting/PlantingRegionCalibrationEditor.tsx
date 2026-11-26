import React, { useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  MonthRegionCalibration,
  PLANTING_REGION_CALIBRATION,
  PARENT_LAND_ASSET_BY_MONTH,
  exportCalibrationSource,
} from './plantingRegionCalibration';
import { MONTH_REGION_METAS } from './plantingRegionData';

export type CalDisplayMode = 'selected' | 'all';
export type CalDragMode = 'region' | 'camera';

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

const OPACITIES = [0.25, 0.5, 0.75, 1.0];

interface Props {
  calibrationMap: Record<number, MonthRegionCalibration>;
  selectedMonth: number;
  displayMode: CalDisplayMode;
  opacity: number;
  dragMode: CalDragMode;
  showLandBounds: boolean;
  onSelectMonth: (month: number) => void;
  onChangeDisplayMode: (mode: CalDisplayMode) => void;
  onChangeOpacity: (op: number) => void;
  onChangeDragMode: (mode: CalDragMode) => void;
  onToggleLandBounds: () => void;
  onNudge: (field: keyof MonthRegionCalibration, delta: number) => void;
  onResetSelected: () => void;
  onResetAll: () => void;
  onSave: () => void;
  onDone: () => void;
  onOpenMaskEditor?: () => void;
}

export default function PlantingRegionCalibrationEditor({
  calibrationMap,
  selectedMonth,
  displayMode,
  opacity,
  dragMode,
  showLandBounds,
  onSelectMonth,
  onChangeDisplayMode,
  onChangeOpacity,
  onChangeDragMode,
  onToggleLandBounds,
  onNudge,
  onResetSelected,
  onResetAll,
  onSave,
  onDone,
  onOpenMaskEditor,
}: Props) {
  const [panelPos, setPanelPos] = useState({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const [uniformScale, setUniformScale] = useState(true);
  const [showExport, setShowExport] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

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

  const currentCal =
    calibrationMap[selectedMonth] || PLANTING_REGION_CALIBRATION[selectedMonth];
  const meta = MONTH_REGION_METAS[selectedMonth];
  const parentAsset = PARENT_LAND_ASSET_BY_MONTH[selectedMonth];

  const handleSave = () => {
    onSave();
    const monthNum = selectedMonth < 10 ? `0${selectedMonth}` : String(selectedMonth);
    setSaveStatus(`Locked Month ${monthNum} (${currentCal?.landId}) to storage!`);
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const handleScaleNudge = (delta: number) => {
    if (uniformScale) {
      onNudge('scaleX', delta);
      onNudge('scaleY', delta);
    } else {
      onNudge('scaleX', delta);
    }
  };

  const exportCode = exportCalibrationSource(calibrationMap);

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
          <View style={styles.headerTitleContainer}>
            <Text style={styles.title}>DEV Calibration</Text>
            <View style={styles.headerMonthBadge}>
              <Text style={styles.headerMonthBadgeText}>{MONTH_LABELS[selectedMonth]}</Text>
            </View>
          </View>
        </View>
        <Pressable style={styles.doneButton} onPress={onDone}>
          <Text style={styles.doneButtonText}>Exit DEV</Text>
        </Pressable>
      </View>

      {/* Independently Scrollable Body */}
      <ScrollView
        style={styles.scrollBody}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
      >
        {/* Readout Summary */}
        <View style={styles.readoutBox}>
          <Text style={styles.readoutTitle}>
            {MONTH_LABELS[selectedMonth]} · <Text style={styles.highlight}>{currentCal?.landId}</Text> (Asset: {parentAsset})
          </Text>
          <View style={styles.readoutGrid}>
            <Text style={styles.readoutText}>
              localX: <Text style={styles.bold}>{currentCal?.localX.toFixed(2)}</Text>
            </Text>
            <Text style={styles.readoutText}>
              localY: <Text style={styles.bold}>{currentCal?.localY.toFixed(2)}</Text>
            </Text>
            <Text style={styles.readoutText}>
              scaleX: <Text style={styles.bold}>{currentCal?.scaleX.toFixed(3)}</Text>
            </Text>
            <Text style={styles.readoutText}>
              scaleY: <Text style={styles.bold}>{currentCal?.scaleY.toFixed(3)}</Text>
            </Text>
            <Text style={styles.readoutText}>
              rot: <Text style={styles.bold}>{currentCal?.rotation.toFixed(1)}°</Text>
            </Text>
          </View>
          {meta && (
            <Text style={styles.subReadout}>
              Raw BBox: [{meta.bbox.x}, {meta.bbox.y}, {meta.bbox.width}×{meta.bbox.height}]
            </Text>
          )}
        </View>

        {/* Stage 2: Manual Mask Paint Editor */}
        <Pressable
          style={styles.actionBtnMaskEditor}
          onPress={onOpenMaskEditor}
        >
          <Text style={styles.actionBtnMaskEditorText}>
            🎨 Edit Mask Shape ({MONTH_LABELS[selectedMonth]})
          </Text>
        </Pressable>

        {/* Month Selector Pills (4x3 Grid) */}
        <Text style={styles.sectionHeader}>Select Month:</Text>
        <View style={styles.monthGrid}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <Pressable
              key={m}
              style={[
                styles.monthPill,
                m === selectedMonth && styles.monthPillSelected,
              ]}
              onPress={() => onSelectMonth(m)}
            >
              <Text
                style={[
                  styles.monthPillText,
                  m === selectedMonth && styles.monthPillTextSelected,
                ]}
              >
                {MONTH_LABELS[m]}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Direct Manipulation Drag Mode Toggle */}
        <Text style={styles.sectionHeader}>Interaction Mode:</Text>
        <View style={styles.segmentedRow}>
          <Pressable
            style={[styles.segBtn, dragMode === 'region' && styles.segBtnActive]}
            onPress={() => onChangeDragMode('region')}
          >
            <Text style={[styles.segBtnText, dragMode === 'region' && styles.segBtnTextActive]}>
              ✋ Drag: Region
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segBtn, dragMode === 'camera' && styles.segBtnActive]}
            onPress={() => onChangeDragMode('camera')}
          >
            <Text style={[styles.segBtnText, dragMode === 'camera' && styles.segBtnTextActive]}>
              🔍 Drag: Pan Camera
            </Text>
          </Pressable>
        </View>

        {/* View Settings */}
        <Text style={styles.sectionHeader}>Display & Outline:</Text>
        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.toggleBtn, displayMode === 'selected' && styles.toggleBtnActive]}
            onPress={() => onChangeDisplayMode(displayMode === 'selected' ? 'all' : 'selected')}
          >
            <Text style={[styles.toggleBtnText, displayMode === 'selected' && styles.toggleBtnTextActive]}>
              {displayMode === 'selected' ? '🎯 Selected Only' : '🌐 All Regions'}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.toggleBtn, showLandBounds && styles.toggleBtnActive]}
            onPress={onToggleLandBounds}
          >
            <Text style={[styles.toggleBtnText, showLandBounds && styles.toggleBtnTextActive]}>
              Land Outline: {showLandBounds ? 'ON' : 'OFF'}
            </Text>
          </Pressable>
        </View>

        {/* Opacity Selector */}
        <View style={styles.opacityRow}>
          <Text style={styles.subLabel}>Mask Opacity:</Text>
          <View style={styles.opacityChips}>
            {OPACITIES.map((op) => (
              <Pressable
                key={op}
                style={[styles.chip, opacity === op && styles.chipActive]}
                onPress={() => onChangeOpacity(op)}
              >
                <Text style={[styles.chipText, opacity === op && styles.chipTextActive]}>
                  {Math.round(op * 100)}%
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Save / Lock & Reset Actions */}
        <Text style={styles.sectionHeader}>Storage & Locking:</Text>
        <Pressable style={styles.actionBtnSave} onPress={handleSave}>
          <Text style={styles.actionBtnSaveText}>
            💾 Save / Lock Month {selectedMonth < 10 ? `0${selectedMonth}` : selectedMonth}
          </Text>
        </Pressable>

        {saveStatus && <Text style={styles.saveStatus}>{saveStatus}</Text>}

        {/* Stage 2 Mask Paint Editor */}
        <Pressable
          style={styles.actionBtnMaskEditor}
          onPress={onOpenMaskEditor}
        >
          <Text style={styles.actionBtnMaskEditorText}>
            🎨 Edit Mask Shape (Month {selectedMonth < 10 ? `0${selectedMonth}` : selectedMonth})
          </Text>
        </Pressable>

        <View style={styles.buttonRow}>
          <Pressable style={styles.actionBtn} onPress={onResetSelected}>
            <Text style={styles.actionBtnText}>↺ Reset Month</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={onResetAll}>
            <Text style={styles.actionBtnText}>↺ Reset All</Text>
          </Pressable>
        </View>

        {/* Fine-Tune Transform Nudges */}
        <Text style={styles.sectionHeader}>Fine-Tune Transform Nudges:</Text>

        {/* Position X */}
        <ControlRow
          label="localX (px)"
          value={currentCal?.localX}
          increments={[-10, -5, -1, 1, 5, 10]}
          onNudge={(n) => onNudge('localX', n)}
        />

        {/* Position Y */}
        <ControlRow
          label="localY (px)"
          value={currentCal?.localY}
          increments={[-10, -5, -1, 1, 5, 10]}
          onNudge={(n) => onNudge('localY', n)}
        />

        {/* Scale */}
        <View style={styles.scaleHeaderRow}>
          <Text style={styles.subLabel}>Scale:</Text>
          <Pressable
            style={[styles.scaleModeChip, uniformScale && styles.scaleModeChipActive]}
            onPress={() => setUniformScale((v) => !v)}
          >
            <Text style={[styles.scaleModeChipText, uniformScale && styles.scaleModeChipTextActive]}>
              Uniform Scale: {uniformScale ? 'ON' : 'OFF'}
            </Text>
          </Pressable>
        </View>

        {uniformScale ? (
          <ControlRow
            label="Scale (X+Y)"
            value={currentCal?.scaleX}
            increments={[-0.01, -0.005, -0.001, 0.001, 0.005, 0.01]}
            precision={3}
            onNudge={handleScaleNudge}
          />
        ) : (
          <>
            <ControlRow
              label="scaleX"
              value={currentCal?.scaleX}
              increments={[-0.01, -0.005, -0.001, 0.001, 0.005, 0.01]}
              precision={3}
              onNudge={(n) => onNudge('scaleX', n)}
            />
            <ControlRow
              label="scaleY"
              value={currentCal?.scaleY}
              increments={[-0.01, -0.005, -0.001, 0.001, 0.005, 0.01]}
              precision={3}
              onNudge={(n) => onNudge('scaleY', n)}
            />
          </>
        )}

        {/* Rotation */}
        <ControlRow
          label="Rotation"
          value={currentCal?.rotation}
          suffix="°"
          increments={[-1, -0.5, -0.1, 0.1, 0.5, 1]}
          precision={1}
          onNudge={(n) => onNudge('rotation', n)}
        />

        {/* Export TS Code */}
        <View style={{ marginTop: 8 }}>
          <Pressable
            style={styles.actionBtnSecondary}
            onPress={() => setShowExport((v) => !v)}
          >
            <Text style={styles.actionBtnSecondaryText}>
              {showExport ? '▲ Hide TS Code' : '📄 Export TS Code'}
            </Text>
          </Pressable>
        </View>

        {showExport && (
          <View style={styles.exportContainer}>
            <Text style={styles.exportHint}>
              Copy and paste into PLANTING_REGION_CALIBRATION in plantingRegionCalibration.ts:
            </Text>
            <TextInput
              multiline
              editable={false}
              selectTextOnFocus
              value={exportCode}
              style={styles.exportBox}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ControlRow({
  label,
  value = 0,
  increments,
  suffix = '',
  precision = 2,
  onNudge,
}: {
  label: string;
  value?: number;
  increments: readonly number[];
  suffix?: string;
  precision?: number;
  onNudge: (delta: number) => void;
}) {
  return (
    <View style={styles.controlRow}>
      <Text style={styles.controlLabel}>
        {label}: <Text style={styles.bold}>{value.toFixed(precision)}{suffix}</Text>
      </Text>
      <View style={styles.nudgeBtnGroup}>
        {increments.map((amt) => (
          <Pressable
            key={amt}
            style={styles.nudgeBtn}
            onPress={() => onNudge(amt)}
          >
            <Text style={styles.nudgeBtnText}>
              {amt > 0 ? `+${amt}` : amt}{suffix}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 330,
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
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  headerDragArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  dragIcon: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: '700',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  headerMonthBadge: {
    backgroundColor: '#059669',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  headerMonthBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  doneButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginLeft: 6,
  },
  doneButtonText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    padding: 10,
    gap: 6,
  },
  readoutBox: {
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  readoutTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  readoutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  readoutText: {
    fontSize: 11,
    color: '#475569',
  },
  bold: {
    fontWeight: '700',
    color: '#0F172A',
  },
  highlight: {
    color: '#059669',
    fontWeight: '700',
  },
  subReadout: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 4,
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
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  monthPill: {
    width: '23.5%',
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthPillSelected: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  monthPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#334155',
  },
  monthPillTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
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
  segBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  segBtnActive: {
    backgroundColor: '#059669',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  segBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 6,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnActive: {
    backgroundColor: '#E0F2FE',
    borderColor: '#0284C7',
  },
  toggleBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  toggleBtnTextActive: {
    color: '#0369A1',
    fontWeight: '700',
  },
  opacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  opacityChips: {
    flexDirection: 'row',
    gap: 4,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  chipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  chipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  actionBtnSave: {
    backgroundColor: '#059669',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  actionBtnSaveText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  saveStatus: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: '#ECFDF5',
    paddingVertical: 4,
    borderRadius: 6,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '600',
  },
  actionBtnSecondary: {
    backgroundColor: '#F8FAFC',
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnSecondaryText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
  },
  controlRow: {
    backgroundColor: '#F8FAFC',
    padding: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  controlLabel: {
    fontSize: 11,
    color: '#475569',
  },
  nudgeBtnGroup: {
    flexDirection: 'row',
    gap: 3,
  },
  nudgeBtn: {
    flex: 1,
    paddingVertical: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeBtnText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1E293B',
  },
  scaleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  scaleModeChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  scaleModeChipActive: {
    backgroundColor: '#E0F2FE',
    borderColor: '#0284C7',
  },
  scaleModeChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  scaleModeChipTextActive: {
    color: '#0369A1',
    fontWeight: '700',
  },
  exportContainer: {
    marginTop: 6,
    padding: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  exportHint: {
    fontSize: 10,
    color: '#64748B',
    marginBottom: 4,
  },
  exportBox: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: '#1E293B',
    backgroundColor: '#FFFFFF',
    padding: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxHeight: 120,
  },
  actionBtnMaskEditor: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  actionBtnMaskEditorText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
});
