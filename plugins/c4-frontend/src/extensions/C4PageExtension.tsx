import { Content, EmptyState, Header, Link, Page, Progress, Table, TableColumn } from '@backstage/core-components';
import { PageBlueprint } from '@backstage/frontend-plugin-api';
import { CatalogFilterLayout } from '@backstage/plugin-catalog-react';
import {
  C4DiagramViewer,
  C4View,
  C4ViewType,
  useC4View,
  useC4Views,
} from '@fulgas/plugin-c4-frontend-common';
import { ReactC4Renderer } from '@fulgas/plugin-c4-renderer-react';
import {
  Box,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Typography,
} from '@material-ui/core';
import React, { useMemo, useState } from 'react';

const renderer = new ReactC4Renderer();

const columns: TableColumn<C4View>[] = [
  { title: 'Title', field: 'title', highlight: true },
  { title: 'Type', field: 'type', width: '120px' },
  { title: 'Source', field: 'source', width: '120px' },
  { title: 'Entity', field: 'entityRef', render: row => row.entityRef ?? '—' },
];

const LEVEL_OPTIONS: { value: C4ViewType | 'all'; label: string }[] = [
  { value: 'all', label: 'All levels' },
  { value: 'landscape', label: 'Landscape' },
  { value: 'context', label: 'Context' },
  { value: 'container', label: 'Container' },
  { value: 'component', label: 'Component' },
];

function kindOf(entityRef: string | undefined): string {
  if (!entityRef) return 'other';
  return entityRef.split(':')[0] ?? 'other';
}

export function C4PageContent() {
  const [level, setLevel] = useState<C4ViewType | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [kindFilter, setKindFilter] = useState<string>('all');

  const effectiveLevel = level === 'all' ? undefined : level;
  const { views, loading: viewsLoading, building } = useC4Views({ level: effectiveLevel });
  const { viewModel, loading: vmLoading, error } = useC4View(selectedId);

  const kinds = useMemo(() => {
    const set = new Set((views ?? []).map(v => kindOf(v.entityRef)));
    return ['all', ...Array.from(set).sort()];
  }, [views]);

  const filtered = useMemo(() =>
    (views ?? []).filter(v => kindFilter === 'all' || kindOf(v.entityRef) === kindFilter),
    [views, kindFilter],
  );

  if (building) {
    return (
      <Page themeId="tool">
        <Header title="C4 Architecture Diagrams" />
        <Content>
          <Box style={{ padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <Progress />
            <Typography variant="subtitle1">Diagrams are being built — please refresh when done.</Typography>
          </Box>
        </Content>
      </Page>
    );
  }

  if (selectedId) {
    return (
      <Page themeId="tool">
        <Header title="C4 Architecture Diagrams" subtitle={viewModel?.view.title} />
        <Content>
          <Box style={{ marginBottom: 12 }}>
            <Link to="#" onClick={e => { e.preventDefault(); setSelectedId(undefined); }}>← Back to all views</Link>
          </Box>
          <C4DiagramViewer viewModel={viewModel} renderer={renderer} loading={vmLoading} error={error} />
        </Content>
      </Page>
    );
  }

  return (
    <Page themeId="tool">
      <Header title="C4 Architecture Diagrams" />
      <Content>
        <CatalogFilterLayout>
          <CatalogFilterLayout.Filters>
            <Box style={{ padding: '8px 16px' }}>
              <FormControl variant="outlined" size="small" fullWidth style={{ marginBottom: 16 }}>
                <InputLabel id="c4-level-label">Level</InputLabel>
                <Select
                  labelId="c4-level-label"
                  label="Level"
                  value={level}
                  onChange={e => {
                    setLevel(e.target.value as C4ViewType | 'all');
                    setKindFilter('all');
                    setSelectedId(undefined);
                  }}
                >
                  {LEVEL_OPTIONS.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              {kinds.length > 1 && (
                <>
                  <Typography variant="subtitle2" style={{ marginBottom: 4 }}>Kind</Typography>
                  <List dense disablePadding>
                    {kinds.map(k => (
                      <ListItem
                        key={k}
                        button
                        selected={kindFilter === k}
                        onClick={() => { setKindFilter(k); setSelectedId(undefined); }}
                        style={{ borderRadius: 4 }}
                      >
                        <ListItemText
                          primary={k === 'all' ? 'All kinds' : k.charAt(0).toUpperCase() + k.slice(1)}
                        />
                      </ListItem>
                    ))}
                  </List>
                </>
              )}
            </Box>
          </CatalogFilterLayout.Filters>

          <CatalogFilterLayout.Content>
            {viewsLoading ? (
              <Progress />
            ) : filtered.length === 0 ? (
              <EmptyState missing="data" title="No views found" description="No C4 diagrams available for this filter." />
            ) : (
              <Table<C4View>
                title="Diagrams"
                options={{ paging: true, pageSize: 20, search: true }}
                columns={columns}
                data={filtered}
                onRowClick={(_e, row) => row && setSelectedId(row.id)}
              />
            )}
          </CatalogFilterLayout.Content>
        </CatalogFilterLayout>
      </Content>
    </Page>
  );
}

export const C4PageExtension = PageBlueprint.make({
  params: {
    path: '/c4',
    loader: async () => <C4PageContent />,
  },
});
