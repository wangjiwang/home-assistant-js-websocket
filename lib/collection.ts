import { Store, createStore } from "./store";
import { Connection } from "./connection";
import { UnsubscribeFunc } from "./types";

export type Collection<State> = {
  state: State;
  refresh(): Promise<void>;
  subscribe(subscriber: (state: State) => void): UnsubscribeFunc;
};

export const getCollection = <State>(
  conn: Connection,
  key: string,
  fetchCollection: (conn: Connection) => Promise<State>,
  subscribeUpdates?: (
    conn: Connection,
    store: Store<State>
  ) => Promise<UnsubscribeFunc>
): Collection<State> => {
  if (conn[key]) {
    return conn[key];
  }

  let active = 0;
  let unsubProm: Promise<UnsubscribeFunc>;
  let store = createStore<State>();

  const refresh = () =>
    fetchCollection(conn).then(state => store.setState(state, true));

  conn[key] = {
    get state() {
      return store.state;
    },

    refresh,

    subscribe(subscriber: (state: State) => void): UnsubscribeFunc {
      if (!active) {
        active++;

        // Subscribe to changes
        if (subscribeUpdates) {
          unsubProm = subscribeUpdates(conn, store);
        }

        // Fetch when connection re-established.
        conn.addEventListener("ready", refresh);

        refresh().catch((err: unknown) => {
          // Swallow errors if socket is connecting, closing or closed.
          // We will automatically call refresh again when we re-establish the connection.
          // Using conn.socket.OPEN instead of WebSocket for better node support
          if (conn.socket.readyState == conn.socket.OPEN) {
            throw err;
          }
        });
      }

      const unsub = store.subscribe(subscriber);

      if (store.state !== undefined) {
        subscriber(store.state);
      }

      return () => {
        unsub();
        active--;
        if (!active) {
          // Unsubscribe from changes
          if (unsubProm)
            unsubProm.then(unsub => {
              unsub();
            });
          conn.removeEventListener("ready", refresh);
        }
      };
    }
  };

  return conn[key];
};

// Legacy name. It gets a collection and subscribes.
export const createCollection = <State>(
  key: string,
  fetchCollection: (conn: Connection) => Promise<State>,
  subscribeUpdates:
    | ((conn: Connection, store: Store<State>) => Promise<UnsubscribeFunc>)
    | undefined,
  conn: Connection,
  onChange: (state: State) => void
): UnsubscribeFunc =>
  getCollection(conn, key, fetchCollection, subscribeUpdates).subscribe(
    onChange
  );
