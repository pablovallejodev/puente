import React from "react"
import { StatusBar } from "react-native";
import { theme } from "@/constants/theme";

export const StatusBarHiddenComponent = React.memo(() =>
    <StatusBar
        hidden={true}
        backgroundColor={theme.colors.background}
        translucent
    />
);
StatusBarHiddenComponent.displayName = "StatusBarHiddenComponent";

export const StatusBarDarkComponent = React.memo(() =>
    <StatusBar
        hidden={false}
        barStyle="dark-content"
        backgroundColor={theme.colors.background}
        translucent={false}
    />
);
StatusBarDarkComponent.displayName = "StatusBarDarkComponent";