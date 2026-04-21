import { Tab, Tabs } from '@material-ui/core';
import React from 'react';
import { C4DiagramLevel } from '../types';

const LEVELS: { value: C4DiagramLevel; label: string }[] = [
  { value: 'landscape', label: 'Landscape' },
  { value: 'context', label: 'System Context' },
  { value: 'container', label: 'Container' },
];

/**
 * Tab-strip that lets the user switch between C4 diagram levels.
 *
 * Levels correspond to node depth in the C4 tree:
 * - **Landscape** — domain-level view (depth 0 subjects)
 * - **System Context** — system-level view (depth 1 subjects)
 * - **Container** — container-level view (depth 2 subjects)
 */
export function C4LevelFilter({
  selected,
  onChange,
}: {
  selected: C4DiagramLevel;
  onChange: (level: C4DiagramLevel) => void;
}) {
  return (
    <Tabs
      value={selected}
      onChange={(_e, val) => onChange(val)}
      indicatorColor="primary"
      textColor="primary"
    >
      {LEVELS.map(l => (
        <Tab key={l.value} value={l.value} label={l.label} />
      ))}
    </Tabs>
  );
}
