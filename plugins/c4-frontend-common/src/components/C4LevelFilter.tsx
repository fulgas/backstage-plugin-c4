import { Tab, TabList, Tabs } from '@backstage/ui';
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
      selectedKey={selected}
      onSelectionChange={key => onChange(key as C4DiagramLevel)}
    >
      <TabList>
        {LEVELS.map(l => (
          <Tab key={l.value} id={l.value}>
            {l.label}
          </Tab>
        ))}
      </TabList>
    </Tabs>
  );
}
