import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Header, Page, Content } from '@backstage/core-components';
import { Breadcrumbs, Link, Box } from '@material-ui/core';
import { DiagramView } from './DiagramView';

function C4DiagramPageInner() {
  const { namespace = 'default', kind = 'domain', name = '' } = useParams<{ namespace: string; kind: string; name: string }>();
  const navigate = useNavigate();

  return (
    <Page themeId="tool">
      <Header title="C4 Architecture" subtitle={name} />
      <Content>
        <Box style={{ marginBottom: 16 }}>
          <Breadcrumbs>
            <Link color="inherit" style={{ cursor: 'pointer' }} onClick={() => navigate('/c4')}>
              C4
            </Link>
            <span>{name}</span>
          </Breadcrumbs>
        </Box>
        <DiagramView key={`${kind}/${namespace}/${name}`} kind={kind} namespace={namespace} name={name} />
      </Content>
    </Page>
  );
}

export function C4DiagramPage() {
  return <C4DiagramPageInner />;
}
