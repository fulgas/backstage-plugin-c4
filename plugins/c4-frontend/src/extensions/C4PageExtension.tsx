import {
  Content,
  EmptyState,
  Header,
  Link,
  Page,
  Progress,
  Table,
  TableColumn,
} from '@backstage/core-components';
import { PageBlueprint } from '@backstage/frontend-plugin-api';
import { CatalogFilterLayout } from '@backstage/plugin-catalog-react';
import { Flex, Text } from '@backstage/ui';
import {
  C4DiagramViewer,
  C4ViewDescriptor,
  useC4View,
  useC4Views,
} from '@fulgas/plugin-c4-frontend-common';
import { ReactC4Renderer } from '@fulgas/plugin-c4-renderer-react';
import { useMemo, useState } from 'react';
import styles from './C4PageExtension.module.css';

const renderer = new ReactC4Renderer();

const columns: TableColumn<C4ViewDescriptor>[] = [
  { title: 'Title', field: 'title', highlight: true },
  { title: 'Source', field: 'source', width: '120px' },
  { title: 'Entity', field: 'entityRef', render: row => row.entityRef ?? '—' },
];

const LEVEL_LABELS: Record<string, string> = {
  landscape: 'Landscape',
  context: 'Context',
  container: 'Container',
  component: 'Component',
};

export function C4PageContent() {
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { descriptors, loading: descriptorsLoading, building } = useC4Views();
  const { diagram, loading: vmLoading, error } = useC4View(selectedId);

  const types = useMemo(() => {
    const set = new Set(
      (descriptors ?? [])
        .map(d => d.level ?? 'other')
        .filter(l => l !== 'other'),
    );
    return set.size > 1 ? ['all', ...Array.from(set).sort()] : [];
  }, [descriptors]);

  const filtered = useMemo(
    () =>
      (descriptors ?? []).filter(
        d => typeFilter === 'all' || d.level === typeFilter,
      ),
    [descriptors, typeFilter],
  );

  if (building) {
    return (
      <Page themeId="tool">
        <Header title="C4 Architecture Diagrams" />
        <Content>
          <Flex
            direction="column"
            align="center"
            className={styles.buildingContainer}
          >
            <Progress />
            <Text variant="body-medium">
              Diagrams are being built — please refresh when done.
            </Text>
          </Flex>
        </Content>
      </Page>
    );
  }

  if (selectedId) {
    return (
      <Page themeId="tool">
        <Header
          title="C4 Architecture Diagrams"
          subtitle={diagram?.descriptor.title}
        />
        <Content>
          <div className={styles.backLink}>
            <Link
              to="#"
              onClick={e => {
                e.preventDefault();
                setSelectedId(undefined);
              }}
            >
              ← Back to all views
            </Link>
          </div>
          <C4DiagramViewer
            diagram={diagram}
            renderer={renderer}
            loading={vmLoading}
            error={error}
          />
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
            <div className={styles.filterBox}>
              {types.length > 0 && (
                <>
                  <Text variant="body-small" className={styles.filterLabel}>
                    Type
                  </Text>
                  <ul className={styles.filterList}>
                    {types.map(t => {
                      const label = t === 'all' ? 'All' : LEVEL_LABELS[t] ?? t;
                      const select = () => {
                        setTypeFilter(t);
                        setSelectedId(undefined);
                      };
                      return (
                        <li key={t}>
                          <button
                            type="button"
                            className={`${styles.filterItem} ${
                              typeFilter === t ? styles.filterItemSelected : ''
                            }`}
                            onClick={select}
                          >
                            {label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          </CatalogFilterLayout.Filters>
          <CatalogFilterLayout.Content>
            {descriptorsLoading && <Progress />}
            {!descriptorsLoading && filtered.length === 0 && (
              <EmptyState
                missing="data"
                title="No views found"
                description="No C4 diagrams available for this filter."
              />
            )}
            {!descriptorsLoading && filtered.length > 0 && (
              <Table<C4ViewDescriptor>
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
