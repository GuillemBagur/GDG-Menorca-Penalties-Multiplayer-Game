# Optimización de Sincronización de Eventos y Restablecimiento de Selección del Portero

Arquitectura robusta con suscripción única en `firebase.ts` para sincronizar las decisiones de tiro y parada sin desajustes de red, y reinicio visual garantizado de los sprites de selección del portero al pasar de ronda.

### User Review & Critical Decisions

> [!IMPORTANT]
> **Decisiones confirmadas en la fase de entrevista:**
> - **Suscripción única en `firebase.ts`**: La conexión con Firestore mantendrá un único listener centralizado que detecta y acumula eventos de la partida, notificando a la capa de juego solo cuando ambos eventos del turno activo (chut del delantero y parada del portero) están disponibles, o cuando se emite la resolución.
> - **Restablecimiento del portero en el siguiente penalti**: Al arrancar una nueva ronda, el portero se posiciona centrado en la línea de gol ($x=800, y=502.1$) y los sprites de selección (retículo de puntería, guía de portería y punto de mira) se reinician desde cero limpios y listos para interactuar.

---

### 1. Overview & Core Concept

- **El problema**: Actualmente, múltiples `useEffect` en React reaccionan de manera dispersa a los cambios de Firestore, lo que puede provocar desfases temporales, dobles ejecuciones o bloqueos en la máquina rival. Asimismo, al transicionar entre penaltis, el estado del selector del portero conservaba referencias del turno anterior en lugar de repintar la interfaz limpia de puntería.
- **La solución**:
  1. Centralizar la recepción y el emparejamiento de eventos en un controlador de sesión único dentro de `src/firebase.ts`.
  2. Implementar un ciclo de vida limpio de transición entre rondas que reinicie los componentes visuales del canvas y de la interfaz reactiva del portero de forma determinista.

---

### 2. User Experience & Visual Design

- **Flujo de Turno Transparente**:
  1. **Fase de Decisión**:
     - El delantero ajusta sus tres barras y envía su tiro. Su pantalla muestra un mensaje de espera sutil y limpio (*"¡Chut enviado! Esperando al portero..."*).
     - El portero ve la portería iluminada con la mirilla interactiva en el centro, hace clic para apuntar y pulsa *"Confirmar Parada"*. Su pantalla pasa a *"¡Posición fijada! Esperando al delantero..."*.
  2. **Detección Automática del Par (Chut + Parada)**:
     - El listener único en `firebase.ts` verifica que ambos paquetes existen en Firestore. El anfitrión resuelve la jugada y emite `ROUND_RESOLVED`.
  3. **Animación y Resultado (3 segundos)**:
     - Ambas máquinas reproducen la animación simultánea: carrera, trayectoria balística, estirada y resultado con sonido espacial.
  4. **Paso al Siguiente Penalti**:
     - El canvas vuelve a la escena inicial (`preview.svg`).
     - Para el nuevo portero, los sprites de selección interactiva (marco de portería y mirilla amarilla animada centrada) reaparecen limpios y listos para el clic sin residuos de la ronda anterior.

---

### 3. Key Product Decisions & Trade-Offs

- **Suscripción Centralizada en `firebase.ts` frente a listeners múltiples en React**:
  - *Decisión*: Registrar un único observador de la subcolección `events` con `onSnapshot` administrado por `firebase.ts`. Este almacena internamente la secuencia, comprueba la existencia de la tupla `(SHOT_COMMITTED, KEEPER_TARGET_SET)` para la ronda actual y despacha un evento limpio `onRoundReadyToResolve` / `onRoundResolved`.
  - *Ventaja*: Evita ciclos infinitos de renderizado en React, desincronizaciones entre dispositivos y dependencias circulares en los hooks.
- **Ciclo de Vida de los Sprites del Portero**:
  - *Decisión*: Al dispararse `ROUND_STARTED`, `GameView` invocará explícitamente `renderer.resetToIdle()` y restablecerá la mirilla inicial del portero con posición neutral `(0.5, 0.3)` visible, reiniciando los estados locales de `KeeperControls`.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌────────────────────────────────────────────────────────┐
│                   Firestore Database                   │
│          matches/{code}/events/{seq: 000001...}        │
└───────────────────────────┬────────────────────────────┘
                            │ (Single onSnapshot Listener)
                            ▼
┌────────────────────────────────────────────────────────┐
│             src/firebase.ts (Session Manager)          │
│  - Tracks current round events                         │
│  - Detects Pair: SHOT_COMMITTED + KEEPER_TARGET_SET    │
│  - Triggers onTurnDecisionsReady(shot, keeper)         │
│  - Host resolves -> writes ROUND_RESOLVED              │
│  - Triggers onRoundResolved(resolution) for both peers │
└───────────────────────────┬────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
┌───────────────────────┐       ┌───────────────────────┐
│     src/render.ts     │       │   React UI Controls   │
│ - Canvas 1600x900     │       │ - StrikerControls     │
│ - resetToIdle()       │       │ - KeeperControls      │
│ - Repaints reticle    │       │ - Scoreboard & Timer  │
│ - Centered Sprites    │       │ - Resets selection    │
└───────────────────────┘       └───────────────────────┘
```

#### Plan de Modificaciones de Código:

1. **`src/firebase.ts`**:
   - Crear la función `createMatchSessionListener(code, callbacks)` que maneja el listener único de Firestore, evita duplicidades de suscripción y orquesta el emparejamiento de eventos del turno.
2. **`src/components/KeeperControls.tsx`**:
   - Agregar prop `round: number`. Al cambiar la ronda, forzar el reseteo de `selectedPoint = null`, `localConfirmed = false` y reactivar la mirilla por defecto centrada.
3. **`src/render.ts`**:
   - Asegurar que `resetToIdle()` y `setKeeperAim()` limpien residuos y posicionen la mirilla de puntería en su estado prístino.
4. **`src/components/GameView.tsx`**:
   - Conectar la sesión única de `firebase.ts`, eliminando los `useEffect` redundantes de comprobación manual de eventos y garantizando transiciones limpias y fluidas entre tandas.
