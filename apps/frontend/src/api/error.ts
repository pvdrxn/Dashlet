/**
 * El motivo REAL de un fallo de la API, en vez de un texto generico.
 *
 * `request` tira `API error <status>: <cuerpo>`, y el cuerpo de Nest es JSON con
 * un `message` que ya explica que paso: "Column 1 needs a name", "Column name
 * must be 40 characters or fewer", "Table not found".
 *
 * Mostrar "Could not change the columns" y nada mas deja al usuario frente a un
 * cartel que dice que fallo algo que no dice cual, y que no dice por que. Con el
 * motivo real, el mensaje se corrige solo en la mayoria de los casos -- uno ve
 * "Table not found" y sabe que borro la tabla en otra pestana.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const match = /API error \d+: ([\s\S]*)$/.exec(err.message);
    if (match) {
      try {
        const parsed: unknown = JSON.parse(match[1]);
        if (parsed && typeof parsed === 'object' && 'message' in parsed) {
          const { message } = parsed as { message?: unknown };
          if (typeof message === 'string' && message) return message;
          // Nest devuelve un arreglo cuando hay varias validaciones.
          if (Array.isArray(message) && message.length) return message.join('; ');
        }
      } catch {
        // La respuesta no era JSON: se muestra el cuerpo crudo, recortado.
      }
      return match[1].slice(0, 160);
    }
  }
  return fallback;
}