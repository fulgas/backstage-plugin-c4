import { Entity } from '@backstage/catalog-model';
import { Content, Header, HeaderLabel, Page } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import {
  catalogApiRef,
  EntityRefLinks,
  FavoriteEntity,
  getEntityRelations,
} from '@backstage/plugin-catalog-react';
import {
  C4ViewDescriptor,
  useC4Views,
  useEntityC4Views,
} from '@fulgas/plugin-c4-frontend-common';
import Box from '@material-ui/core/Box';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styles from './C4DiagramPage.module.css';
import { DiagramView } from './DiagramView';

const LEVEL_LABELS: Record<string, string> = {
  landscape: 'system landscape',
  context: 'system context',
  container: 'container',
  component: 'component',
};

function diagramPath(d: C4ViewDescriptor): string {
  if (!d.entityRef) return '/c4';
  const [kindPart, rest] = d.entityRef.split(':');
  const [ns, nm] = (rest ?? '').split('/');
  return `/c4/${ns}/${kindPart}/${nm}`;
}

function C4DiagramPageInner() {
  const {
    namespace = 'default',
    kind = 'domain',
    name = '',
    viewId = '',
  } = useParams<{
    namespace: string;
    kind: string;
    name: string;
    viewId: string;
  }>();
  const navigate = useNavigate();
  const entityRef = `${kind}:${namespace}/${name}`;

  const { descriptors } = useEntityC4Views(kind, namespace, name);
  const selectedDescriptor =
    descriptors?.find(d => !viewId || d.id === viewId) ?? descriptors?.[0];
  const levelLabel = selectedDescriptor?.level
    ? LEVEL_LABELS[selectedDescriptor.level] ?? selectedDescriptor.level
    : '';

  const { descriptors: allDescriptors } = useC4Views();
  const ancestors = useMemo((): C4ViewDescriptor[] => {
    if (!selectedDescriptor || !allDescriptors) return [];
    const descMap = new Map(
      allDescriptors.filter(d => d.entityRef).map(d => [d.entityRef!, d]),
    );
    const chain: C4ViewDescriptor[] = [];
    let current: C4ViewDescriptor | undefined = selectedDescriptor;
    while (current?.parentEntityRef) {
      const parent = descMap.get(current.parentEntityRef);
      if (!parent) break;
      chain.unshift(parent);
      current = parent;
    }
    return chain;
  }, [selectedDescriptor, allDescriptors]);

  const catalogApi = useApi(catalogApiRef);
  const [entity, setEntity] = useState<Entity | undefined>();
  useEffect(() => {
    catalogApi.getEntityByRef(entityRef).then(e => setEntity(e ?? undefined));
  }, [entityRef, catalogApi]);
  const ownerRefs = entity ? getEntityRelations(entity, 'ownedBy') : [];

  const headerType = [kind.toLowerCase(), levelLabel]
    .filter(Boolean)
    .join(' — ');

  return (
    <Page themeId="tool">
      <Header
        title={
          <Box display="inline-flex" alignItems="center">
            <Box
              component="span"
              textOverflow="ellipsis"
              whiteSpace="nowrap"
              overflow="hidden"
            >
              {name}
            </Box>
            {entity && <FavoriteEntity entity={entity} />}
          </Box>
        }
        pageTitleOverride={name}
        type={headerType}
      >
        {ownerRefs.length > 0 && (
          <HeaderLabel
            label="Owner"
            contentTypograpyRootComponent="p"
            value={
              <EntityRefLinks
                entityRefs={ownerRefs}
                defaultKind="Group"
                color="inherit"
              />
            }
          />
        )}
        {selectedDescriptor?.source && (
          <HeaderLabel
            label="Source"
            contentTypograpyRootComponent="p"
            value={selectedDescriptor.source}
          />
        )}
      </Header>
      <Content>
        {ancestors.length > 0 && (
          <div className={styles.boundaries}>
            {ancestors.map(ancestor => (
              <button
                key={ancestor.id}
                className={styles.boundaryChip}
                onClick={() => navigate(diagramPath(ancestor))}
              >
                <span className={styles.boundaryTitle}>{ancestor.title}</span>
                {ancestor.level && (
                  <span className={styles.boundaryLevel}>
                    {LEVEL_LABELS[ancestor.level] ?? ancestor.level}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        <DiagramView
          key={`${kind}/${namespace}/${name}`}
          kind={kind}
          namespace={namespace}
          name={name}
          viewId={viewId}
        />
      </Content>
    </Page>
  );
}

export function C4DiagramPage() {
  return <C4DiagramPageInner />;
}
