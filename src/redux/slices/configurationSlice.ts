import { createSlice } from '@reduxjs/toolkit';
import { ConfigurationStateType } from '../types';

const initialState: ConfigurationStateType = {
  initialConfiguration: false,
};

const configurationSlice = createSlice({
  name: 'configuration',
  initialState,
  reducers: {
    endInitialConfiguration: (state) => {
      if (!state.initialConfiguration) state.initialConfiguration = true;
    },
  },
});

export default configurationSlice.reducer;
export const { endInitialConfiguration } = configurationSlice.actions;
