import { createContext, useContext } from "react";

/** Permet à n'importe quelle page d'ouvrir Stack avec une question déjà posée. */
type AssistantContextValue = { ask: (text: string) => void };

export const AssistantContext = createContext<AssistantContextValue>({ ask: () => {} });
export const useAssistant = () => useContext(AssistantContext);
