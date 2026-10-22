import React from 'react';

type AndroidLandscapeStageProps = {
    children: React.ReactNode;
};

/** Android phone viewport adapter for the app's landscape-first player surface. */
const AndroidLandscapeStage: React.FC<AndroidLandscapeStageProps> = ({ children }) => (
    <div className="folia-android-stage-viewport" aria-label="Folia Android landscape viewport">
        <div className="folia-android-stage">{children}</div>
    </div>
);

export default AndroidLandscapeStage;
