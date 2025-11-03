import { Content, Header, Page } from '@backstage/core-components';
import { Typography } from '@material-ui/core';
import React from 'react';

export const C4Page = () => {
  return (
    <Page themeId="tool">
      <Header title="C4 Architecture Diagrams" />
      <Content>
        <Typography variant="body1">C4 plugin content goes here</Typography>
      </Content>
    </Page>
  );
};
