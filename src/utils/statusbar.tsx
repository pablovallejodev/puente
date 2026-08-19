import React from 'react';
import { StatusBar } from 'react-native';

export const StatusBarHiddenComponent = React.memo(() => <StatusBar hidden />);

export const StatusBarComponent = React.memo(() => <StatusBar barStyle="dark-content" />);
