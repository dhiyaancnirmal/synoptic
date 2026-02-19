interface PanelStateProps {
  state: "loading" | "empty" | "error";
  title: string;
  description: string;
}

export function PanelState({ state, title, description }: PanelStateProps) {
  return (
    <div className={`panel-state panel-state-${state}`}>
      <p className="pixel-text">{state}</p>
      <h4>{title}</h4>
      <p>{description}</p>
    </div>
  );
}
