// Sandbox entry for the Stage-3 look test (reference "cart" short): renders only src/videos/court.
import React from "react";
import { Composition, registerRoot } from "remotion";
import { CourtTest, COURT_FRAMES } from "../../videos/court/Court";

const Root: React.FC = () => <Composition id="Court" component={CourtTest} durationInFrames={COURT_FRAMES} fps={30} width={1080} height={1920} />;
registerRoot(Root);
