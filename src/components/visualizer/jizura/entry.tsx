import React from 'react';
import { defineVisualizer } from '../definition';

const VisualizerJizura = React.lazy(() => import('./VisualizerJizura'));

export default defineVisualizer({
    mode: 'jizura',
    category: 'jizura',
    order: 14,
    labelKey: 'ui.visualizerJizura',
    labelFallback: 'JIZURA 文字 MV',
    previewSeed: 'jizura',
    previewStartOffset: 1.2,
    tuningKind: 'none',
    usesWordSegmentation: false,
    render: props => <VisualizerJizura {...props} />,
});
