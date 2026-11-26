// Sandbox entry for the diorama template (copy to src/sandboxes/<name>/index.tsx, set the import path): composition "Diorama".
import React from "react";
import { Composition, registerRoot } from "remotion";
import { CourtTest, COURT_FRAMES } from "../../videos/<name>/Court";

const Root: React.FC = () => <Composition id="Diorama" component={CourtTest} durationInFrames={COURT_FRAMES} fps={30} width={1080} height={1920} />;
registerRoot(Root);
