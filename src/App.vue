<script setup lang="ts">
import { ref, computed, onBeforeUnmount, nextTick } from "vue";
import Icon from "./Icon.vue";
import { Engine } from "./engine.ts";
import type { Snapshot, Team } from "../shared/protocol.ts";
const host = ref<HTMLElement>(),
  mini = ref<HTMLCanvasElement>(),
  state = ref<Snapshot>(),
  connected = ref(false),
  connecting = ref(false),
  name = ref(localStorage.getItem("oh-name") || "Сотрудник"),
  team = ref<Team>("ALPHA"),
  skin = ref(0),
  room = ref(
    new URLSearchParams(location.search).get("room")?.toUpperCase() ||
      "NIGHT01",
  ),
  error = ref(""),
  copied = ref(false),
  muted = ref(false);
let socket: WebSocket | undefined,
  engine: Engine | undefined,
  attempt = 0;
const self = computed(() => state.value?.self);
const phase = computed(() => state.value?.phase);
const clock = computed(() => {
  const n = Math.ceil(state.value?.remaining ?? 300);
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
});
const low = computed(() => (self.value?.hp ?? 100) <= 25);
const roster = (t: Team) =>
  state.value?.roster.filter((p) => p.team === t) ?? [];
function websocketUrl() {
  const configured = import.meta.env.VITE_WS_URL?.trim();
  if (configured) return configured;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws`;
}
async function connect() {
  if (connecting.value || connected.value) return;
  error.value = "";
  connecting.value = true;
  const current = ++attempt;
  try {
    await nextTick();
    engine = new Engine(host.value!, mini.value!, (input) => {
      if (socket?.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: "input", input }));
    });
    await engine.init();
    if (current !== attempt) return;
    engine.audio.start();
    socket = new WebSocket(websocketUrl());
    socket.onopen = () =>
      socket?.send(
        JSON.stringify({
          type: "join",
          room: room.value.trim().toUpperCase(),
          name: name.value,
          team: team.value,
          skin: skin.value,
        }),
      );
    socket.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "error") {
        error.value = data.message;
        if (!connected.value) disconnect(false);
        return;
      }
      if (data.type === "joined") {
        connected.value = true;
        connecting.value = false;
        room.value = data.room;
        localStorage.setItem("oh-name", name.value);
        history.replaceState({}, "", `?room=${encodeURIComponent(data.room)}`);
      }
      if (data.type === "state") {
        state.value = data;
        engine?.accept(data);
      }
    };
    socket.onerror = () => {
      error.value = "Не удалось подключиться. Проверьте, что сервер запущен.";
    };
    socket.onclose = () => {
      if (current === attempt) {
        if (connected.value)
          error.value =
            "Соединение с сервером закрыто. Войдите в комнату снова.";
        disconnect(false);
      }
    };
  } catch (e) {
    error.value = e instanceof Error ? e.message : "WebGL недоступен";
    disconnect(false);
  }
}
function disconnect(clear = true) {
  ++attempt;
  socket?.close();
  socket = undefined;
  engine?.dispose();
  engine = undefined;
  connected.value = false;
  connecting.value = false;
  state.value = undefined;
  if (clear) error.value = "";
}
function send(type: string) {
  socket?.send(JSON.stringify({ type }));
}
function ready() {
  engine?.audio.start();
  send("ready");
  (document.activeElement as HTMLElement)?.blur();
}
function training() {
  send("training");
  send("ready");
}
async function invite() {
  try {
    await navigator.clipboard.writeText(location.href);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1800);
  } catch {
    error.value = `Отправьте другу ссылку ${location.href}`;
  }
}
function mute() {
  engine?.audio.toggle();
  muted.value = engine?.audio.muted ?? false;
}
onBeforeUnmount(() => disconnect());
</script>
<template>
  <main>
    <div
      ref="host"
      class="viewport"
      :class="{ playing: phase === 'playing' }"
      aria-label="Игровая 3D-сцена"
    ></div>
    <div class="vignette" :class="{ danger: low && phase === 'playing' }"></div>
    <div class="grain"></div>
    <div v-if="!connected" class="entry">
      <div class="blueprint" aria-hidden="true">
        <div v-for="i in 18" :key="i"></div>
      </div>
      <header>
        <a class="brand" href="/">AH<span>AFTER HOURS</span></a
        ><span class="build-label"
          >MULTIPLAYER OFFICE HORROR <b> / </b> TEST BUILD 0.1</span
        >
      </header>
      <section class="entry-main">
        <div class="intro">
          <div class="eyebrow"><i></i> СМЕНА ОКОНЧЕНА. ВЫ ЕЩЁ ЗДЕСЬ.</div>
          <h1>AFTER<br /><span>HOURS</span><em>Не все ушли домой.</em></h1>
          <p>Тёмный офис. Чужие шаги.<br />И только свет фонаря между вами.</p>
          <div class="principles">
            <span>01 <b>СВЕТ</b></span
            ><span>02 <b>ЗВУК</b></span
            ><span>03 <b>НЕИЗВЕСТНОСТЬ</b></span>
          </div>
        </div>
        <form class="setup" @submit.prevent="connect">
          <div class="panel-top">
            <span>ДОПУСК В ОФИС</span><span class="status-dot">ONLINE PVP</span>
          </div>
          <label class="field-label" for="nickname">01 / ПОЗЫВНОЙ</label
          ><input
            id="nickname"
            v-model="name"
            maxlength="18"
            placeholder="Ваше имя"
            required
            autocomplete="nickname"
          />
          <div class="field-label">02 / КОМАНДА</div>
          <div class="team-options">
            <button
              type="button"
              :class="['team alpha', { selected: team === 'ALPHA' }]"
              @click="team = 'ALPHA'"
            >
              <Icon name="shield" /><span>ALPHA<small>СИНИЙ ОТРЯД</small></span
              ><i></i></button
            ><button
              type="button"
              :class="['team bravo', { selected: team === 'BRAVO' }]"
              @click="team = 'BRAVO'"
            >
              <Icon name="shield" /><span
                >BRAVO<small>КРАСНЫЙ ОТРЯД</small></span
              ><i></i>
            </button>
          </div>
          <div class="field-label">03 / ПЕРСОНАЖ</div>
          <div class="characters">
            <button
              v-for="(label, i) in ['Сотрудник', 'Охрана']"
              :key="i"
              type="button"
              :class="{ selected: skin === i }"
              @click="skin = i"
            >
              <div class="avatar" :class="{ guard: i === 1 }">
                <div class="head"></div>
                <div class="body"></div>
              </div>
              <span
                >{{ label
                }}<small>{{ i ? "NIGHT WATCH" : "LAST EMPLOYEE" }}</small></span
              ><span class="choice">{{ skin === i ? "●" : "○" }}</span>
            </button>
          </div>
          <label class="field-label" for="room">04 / КОД КОМНАТЫ</label>
          <div class="room-field">
            <Icon name="link" /><input
              id="room"
              v-model="room"
              pattern="[A-Za-z0-9]{3,12}"
              minlength="3"
              maxlength="12"
              required
              autocomplete="off"
            />
          </div>
          <small class="hint"
            >Одинаковый код — один офис. Поделитесь им с другом.</small
          >
          <div class="loadout">
            <Icon name="glow" /><Icon name="banana" /><Icon name="gun" /><span
              >СТАНДАРТНОЕ СНАРЯЖЕНИЕ</span
            >
          </div>
          <button class="primary" :disabled="connecting">
            {{ connecting ? "ПОДКЛЮЧЕНИЕ…" : "ВОЙТИ В ОФИС"
            }}<Icon name="arrow" />
          </button>
        </form>
      </section>
      <footer>
        <span><i></i> НАДЕНЬТЕ НАУШНИКИ. ПРИСЛУШАЙТЕСЬ.</span
        ><span>W A S D <b>ДВИЖЕНИЕ</b> · МЫШЬ <b>ПРИЦЕЛ</b></span>
      </footer>
    </div>
    <template v-if="connected">
      <div class="team-hud">
        <div
          v-for="t in ['ALPHA', 'BRAVO'] as const"
          :key="t"
          :class="['team-counter', t.toLowerCase()]"
        >
          <Icon name="person" /><span
            >{{ t
            }}<strong
              >{{ state?.counts[t] ?? 0 }}
              <small>/ {{ roster(t).length }}</small></strong
            ></span
          >
        </div>
      </div>
      <div class="match-info">
        <span>{{ room }}</span
        ><b>{{ phase === "playing" ? clock : "AFTER HOURS" }}</b
        ><small>{{
          phase === "playing" ? "НЕ ТЕРЯЙТЕ БДИТЕЛЬНОСТЬ" : "ОФИС ЖДЁТ"
        }}</small>
      </div>
      <div class="top-actions">
        <button
          @click="mute"
          :aria-label="muted ? 'Включить звук' : 'Выключить звук'"
          :class="{ off: muted }"
        >
          <Icon name="sound" /></button
        ><button @click="disconnect()" aria-label="Выйти из комнаты">
          <Icon name="exit" />
        </button>
      </div>
      <div v-if="phase === 'playing'" class="health">
        <div class="portrait">
          <div class="avatar" :class="{ guard: skin === 1 }">
            <div class="head"></div>
            <div class="body"></div>
          </div>
        </div>
        <div>
          <small>{{ self?.name }}</small>
          <div class="hp-track">
            <div :style="{ width: (self?.hp ?? 100) + '%' }"></div>
          </div>
          <strong>{{ self?.hp }}<span> / 100</span></strong>
        </div>
      </div>
      <div v-if="phase === 'playing'" class="abilities">
        <button
          @click="engine?.trigger(1)"
          :disabled="(self?.lightCd ?? 0) > 0"
        >
          <kbd>1</kbd><Icon name="glow" /><span>{{
            self?.lightCd ? Math.ceil(self.lightCd) + " c" : "ХИМСВЕТ"
          }}</span>
          <div
            v-if="self?.lightCd"
            class="cooldown"
            :style="{ height: (self.lightCd / 24) * 100 + '%' }"
          ></div></button
        ><button
          @click="engine?.trigger(2)"
          :disabled="(self?.bananaCd ?? 0) > 0"
        >
          <kbd>2</kbd><Icon name="banana" /><span>{{
            self?.bananaCd ? Math.ceil(self.bananaCd) + " c" : "БАНАН"
          }}</span>
          <div
            v-if="self?.bananaCd"
            class="cooldown"
            :style="{ height: (self.bananaCd / 12) * 100 + '%' }"
          ></div></button
        ><button class="active" @click="engine?.trigger(3)">
          <kbd>3</kbd><Icon name="gun" /><span>ПИСТОЛЕТ</span>
        </button>
      </div>
      <div v-if="phase === 'playing'" class="ammo">
        <span>9 MM / SERVICE PISTOL</span
        ><strong
          >{{ String(self?.ammo ?? 0).padStart(2, "0")
          }}<small> / 12</small></strong
        ><button @click="engine?.trigger(4)">
          <kbd>R</kbd> {{ self?.reload ? "ПЕРЕЗАРЯДКА…" : "ПЕРЕЗАРЯДИТЬ" }}
        </button>
      </div>
      <div v-if="phase === 'playing' && self?.slip" class="center-notice">
        ВЫ ПОСКОЛЬЗНУЛИСЬ
      </div>
      <div v-if="phase === 'playing' && self?.hp === 0" class="death">
        <span>СВЕТ ПОГАС</span>
        <h2>Вы выбыли</h2>
        <p>Дождитесь завершения раунда.</p>
      </div>
      <section v-if="phase === 'lobby' || phase === 'ended'" class="lobby">
        <div class="eyebrow">
          {{ phase === "ended" ? "РАУНД ЗАВЕРШЁН" : "КОМНАТА " + room }}
        </div>
        <h2>
          {{
            phase === "ended"
              ? state?.winner === "НИЧЬЯ"
                ? "Ничья"
                : state?.winner + " побеждает"
              : "Кто остался в офисе?"
          }}
        </h2>
        <p>Выберите готовность. Нужен хотя бы один игрок в каждой команде.</p>
        <div class="rosters">
          <div
            v-for="t in ['ALPHA', 'BRAVO'] as const"
            :key="t"
            :class="t.toLowerCase()"
          >
            <h3>
              {{ t }}
              <small>{{ roster(t).length }} / {{ state?.teamSize }}</small>
            </h3>
            <div v-for="p in roster(t)" :key="p.id" class="roster-player">
              <Icon name="person" /><span
                >{{ p.name }}<small v-if="p.bot">ТРЕНИРОВОЧНЫЙ БОТ</small></span
              ><b :class="{ ready: p.ready }">{{
                p.ready ? "ГОТОВ" : "ОЖИДАНИЕ"
              }}</b>
            </div>
            <div v-if="!roster(t).length" class="empty-slot">
              Ожидание сотрудника…
            </div>
          </div>
        </div>
        <button class="primary" @click="ready">
          {{ self?.ready ? "ОТМЕНИТЬ ГОТОВНОСТЬ" : "Я ГОТОВ"
          }}<Icon name="arrow" />
        </button>
        <div class="lobby-actions">
          <button @click="invite">
            <Icon name="link" />{{
              copied ? "ССЫЛКА СКОПИРОВАНА" : "ПРИГЛАСИТЬ ДРУГА"
            }}</button
          ><button v-if="state?.roster.length === 1" @click="training">
            ТРЕНИРОВКА С БОТОМ
          </button>
        </div>
        <div class="controls">
          <span><kbd>WASD</kbd> движение</span><span><kbd>SHIFT</kbd> бег</span
          ><span><kbd>ЛКМ</kbd> огонь</span
          ><span><kbd>1 / 2</kbd> способности</span
          ><span><kbd>R</kbd> перезарядка</span>
        </div>
      </section>
    </template>
    <div class="minimap" :class="{ hidden: !connected || phase !== 'playing' }">
      <canvas ref="mini" width="210" height="210"></canvas
      ><span>ИССЛЕДОВАННАЯ ЗОНА</span>
    </div>
    <div v-if="error" class="error" role="alert">
      {{ error }}<button @click="error = ''" aria-label="Закрыть">×</button>
    </div>
    <div v-if="phase === 'playing'" class="bottom-tip">
      <kbd>SHIFT</kbd> БЕГ <span>·</span> ШАГИ ВЫДАЮТ ВАШЕ ПОЛОЖЕНИЕ
    </div>
  </main>
</template>
