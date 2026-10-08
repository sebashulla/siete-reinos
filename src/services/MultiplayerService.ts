import type { RealtimeChannel } from '@supabase/supabase-js';
import { requireSupabase } from './supabase';
import type { Interaction, Member, Position, Room, WorldSnapshot } from '../data/types';
import { MessageGate, parseInteraction, parsePosition, parseWorld } from '../net/protocol';
interface Callbacks {
  position: (user: string, data: Position) => void;
  interaction: (user: string, data: Interaction) => void;
  members: (members: Member[], online: Set<string>) => void;
  status: (status: string) => void;
  world: (snapshot:WorldSnapshot)=>void;
  host: (userId:string)=>void;
  lostAccess:(message:string)=>void;
}
export class MultiplayerService {
  private channels = new Map<string, RealtimeChannel>();
  private roster: Member[] = [];
  private online = new Set<string>();
  private poll?: ReturnType<typeof setInterval>;
  private callbacks?: Callbacks;
  private userId = '';
  private room?: Room;
  private generation = 0;
  private polling = false;
  private sequence = Date.now() * 100;
  private lastMove = 0;
  private lastInteraction = 0;
  private ready = false;
  private lastWorld=0;
  get isReady() { return this.ready; }
  async createRoom(): Promise<Room> {
    const { data, error } = await requireSupabase().rpc('create_room');
    if (error) throw error; return data as Room;
  }
  async joinRoom(code: string): Promise<Room> {
    const { data, error } = await requireSupabase().rpc('join_room', { p_code: code.trim().toUpperCase() });
    if (error) throw error; if (data?.error) throw new Error(data.error); return data as Room;
  }
  async currentRoom(): Promise<Room | null> {
    const { data, error } = await requireSupabase().from('rooms').select('id,code,mode,owner_id').maybeSingle();
    if (error) throw error; return data as Room | null;
  }
  async connect(room: Room, userId: string, callbacks: Callbacks): Promise<void> {
    await this.disconnect();
    this.room = room; this.userId = userId; this.callbacks = callbacks;
    const generation = this.generation;
    const { data } = await requireSupabase().auth.getSession();
    if (!data.session) throw new Error('Tu sesión ha caducado. Inicia sesión otra vez.');
    await requireSupabase().realtime.setAuth(data.session.access_token);
    callbacks.status('Conectando');
    await this.refreshRoster(generation);
    this.poll = setInterval(() => { void this.refreshRoster(generation).catch(async(error:unknown) => {
      const failure=error as {code?:string;message?:string};
      if(failure.code==='PGRST116'||/No perteneces/i.test(failure.message??'')){
        await this.disconnect();callbacks.lostAccess('Ya no perteneces a esta sala. Puedes crear otra desde el lobby.');
      }else callbacks.status('Reconectando');
    }); }, 4000);
  }
  private async refreshRoster(generation: number): Promise<void> {
    if (this.polling || !this.room || generation !== this.generation) return;
    this.polling = true;
    try {
      const client=requireSupabase();
      const [{data,error},{data:updatedRoom,error:roomError}]=await Promise.all([
        client.rpc('room_roster',{p_room:this.room.id}),
        client.from('rooms').select('owner_id').eq('id',this.room.id).single(),
      ]);
      if (generation !== this.generation) return;
      if (error) throw error;
      if(roomError)throw roomError;
      this.room.owner_id=updatedRoom.owner_id;this.callbacks?.host(this.room.owner_id);
      this.roster = data as Member[];
      const allowed = new Set(this.roster.map(m => m.user_id));
      for (const [id, channel] of this.channels) if (!allowed.has(id)) {
        this.channels.delete(id); this.online.delete(id); await requireSupabase().removeChannel(channel);
      }
      for (const member of this.roster) if (!this.channels.has(member.user_id)) await this.subscribeMember(member, generation);
      this.notifyMembers();
      if (this.ready) this.callbacks?.status('En línea');
    } finally { if(generation===this.generation)this.polling = false; }
  }
  private async subscribeMember(member: Member, generation: number): Promise<void> {
    if (!this.room) return;
    const own = member.user_id === this.userId;
    let gate = new MessageGate();
    let worldSequence=-1;
    const channel = requireSupabase().channel(`room:${this.room.id}:player:${member.user_id}`, {
      config: { private: true, broadcast: { self: false, ack: true }, presence: { key: member.user_id } },
    });
    this.channels.set(member.user_id, channel);
    channel.on('broadcast', { event: 'move' }, ({ payload }: { payload: unknown }) => {
      if (own || generation !== this.generation || !this.online.has(member.user_id)) return;
      const position = parsePosition(payload);
      if (position && gate.accept(position.seq, 'position', Date.now())) this.callbacks?.position(member.user_id, position);
    }).on('broadcast', { event: 'action' }, ({ payload }: { payload: unknown }) => {
      if (own || generation !== this.generation || !this.online.has(member.user_id)) return;
      const action = parseInteraction(payload);
      if (action && gate.accept(action.seq, 'interaction', Date.now())) this.callbacks?.interaction(member.user_id, action);
    }).on('broadcast',{event:'world'},({payload}:{payload:unknown})=>{
      if(own||generation!==this.generation||member.user_id!==this.room?.owner_id)return;
      const snapshot=parseWorld(payload);if(snapshot&&snapshot.seq>worldSequence&&gate.accept(snapshot.seq,'world',Date.now())){worldSequence=snapshot.seq;this.callbacks?.world(snapshot);}
    }).on('presence', { event: 'sync' }, () => {
      if (generation !== this.generation) return;
      const active = Object.values(channel.presenceState()).some(list => list.length > 0);
      if (active) this.online.add(member.user_id); else { this.online.delete(member.user_id); gate = new MessageGate();worldSequence=-1; }
      this.notifyMembers();
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Realtime no respondió. Revisa las políticas RLS y la configuración de canales privados.')), 12000);
      channel.subscribe((status, error) => {
        if (generation !== this.generation) { clearTimeout(timeout); resolve(); return; }
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          if (own) void channel.track({ connected_at: new Date().toISOString() }).then(result => {
            if (generation !== this.generation) return;
            this.ready = result === 'ok';
            this.callbacks?.status(this.ready ? 'En línea' : 'Sin presencia');
            if (this.ready) resolve(); else reject(new Error('No se pudo publicar tu presencia. Revisa RLS.'));
          }); else resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (own) { this.ready = false; this.callbacks?.status('Reconectando'); }
          this.online.delete(member.user_id); this.notifyMembers();
          clearTimeout(timeout); reject(new Error(error?.message ?? `Error Realtime: ${status}`));
        }
      });
    });
  }
  private notifyMembers(): void { this.callbacks?.members(this.roster, new Set(this.online)); }
  sendPosition(position: Omit<Position, 'seq'>): void {
    const now = performance.now();
    if (!this.ready || now - this.lastMove < (position.moving ? 190 : 800)) return;
    this.lastMove = now;
    void this.channels.get(this.userId)?.send({ type: 'broadcast', event: 'move', payload: { ...position, seq: ++this.sequence } }).then(result => {
      if (result !== 'ok') this.callbacks?.status('Reconectando');
    });
  }
  sendInteraction(action: Omit<Interaction, 'seq'>): void {
    const now = performance.now();
    if (!this.ready || now - this.lastInteraction < 150) return;
    this.lastInteraction = now;
    void this.channels.get(this.userId)?.send({ type: 'broadcast', event: 'action', payload: { ...action, seq: ++this.sequence } });
  }
  sendWorld(enemies:WorldSnapshot['enemies']):void {
    const now=performance.now();
    if(!this.ready||this.room?.owner_id!==this.userId||now-this.lastWorld<350)return;
    this.lastWorld=now;void this.channels.get(this.userId)?.send({type:'broadcast',event:'world',payload:{enemies,seq:++this.sequence}});
  }
  async disconnect(): Promise<void> {
    this.generation++; this.ready = false;this.polling=false;
    if (this.poll) clearInterval(this.poll);
    const channels = [...this.channels.values()]; this.channels.clear(); this.online.clear(); this.roster = [];
    this.room = undefined; this.callbacks = undefined;
    await Promise.all(channels.map(c => requireSupabase().removeChannel(c)));
  }
  async leave(room: Room): Promise<void> {
    await this.disconnect();
    const { error } = await requireSupabase().rpc('leave_room', { p_room: room.id });
    if (error) throw error;
  }
}
