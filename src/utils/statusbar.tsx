import React from "react"
import { StatusBar } from "react-native";

export const StatusBarHiddenComponent = React.memo(() =>
    <StatusBar
        hidden={true}
        backgroundColor={"white"}
        translucent
    />
);

export const StatusBarComponent = React.memo(() =>
    <StatusBar
        hidden={false}
        barStyle="dark-content"
        backgroundColor={"white"}
        translucent
    />
);
