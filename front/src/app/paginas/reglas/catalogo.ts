// Administrador de reglas: catálogo, borrador, simulación, impacto y versiones.
//
// El back aplica su propio catálogo (back/app/reglas.py) y todavía no tiene una ruta para recibir
// cambios. Publicar aquí registra la versión con su fuente y motivo; la usan el comparador, las
// vigencias del gestor y las simulaciones de este prototipo, y queda en la bitácora.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { simular } from '../../core/analisis';
import { ExpedientesService } from '../../core/expedientes.service';
import { FlujoService } from '../../core/flujo.service';
import { Efecto } from '../../core/modelos';
import { GRUPOS, PARAMETRO_INFO, Parametros, REGLAS, Regla } from '../../core/reglas-catalogo';
import { Encabezado, fecha } from '../../ui/ui';

const EFECTOS: Efecto[] = ['No cumple', 'Requiere revisión', 'Informativo'];

@Component({
  selector: 'app-catalogo',
  imports: [Encabezado, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './catalogo.html',
  styleUrl: './catalogo.css',
})
export class Catalogo {
  private readonly flujo = inject(FlujoService);
  private readonly expedientes = inject(ExpedientesService);
  protected readonly grupos = GRUPOS;
  protected readonly efectos = EFECTOS;
  protected readonly PARAMETRO_INFO = PARAMETRO_INFO;
  protected readonly claves = Object.keys(PARAMETRO_INFO) as (keyof Parametros)[];
  protected readonly fecha = fecha;

  protected readonly vigente = this.flujo.reglasVigentes;
  protected readonly versiones = computed(() => [...this.flujo.versionesReglas()].reverse());
  protected readonly borradorEfectos = signal<Record<string, Efecto>>({ ...this.flujo.reglasVigentes().efectos });
  protected readonly borradorParametros = signal<Parametros>({ ...this.flujo.reglasVigentes().parametros });
  protected readonly grupo = signal<string>('Todas');
  protected readonly q = signal('');

  protected readonly reglas = computed(() => {
    const q = this.q().trim().toLowerCase();
    return REGLAS.filter((r) => (this.grupo() === 'Todas' || r.grupo === this.grupo()) &&
      (!q || r.id.toLowerCase().includes(q) || r.nombre.toLowerCase().includes(q)));
  });

  /** Diferencias entre el borrador y la versión publicada. */
  protected readonly cambios = computed(() => {
    const v = this.vigente(), c: string[] = [];
    for (const r of REGLAS) {
      if (this.borradorEfectos()[r.id] !== v.efectos[r.id]) c.push(`${r.id}: ${v.efectos[r.id]} → ${this.borradorEfectos()[r.id]}`);
    }
    for (const k of this.claves) {
      if (this.borradorParametros()[k] !== v.parametros[k]) c.push(`${PARAMETRO_INFO[k].nombre}: ${v.parametros[k]} → ${this.borradorParametros()[k]}`);
    }
    return c;
  });

  /** En qué versión cambió por última vez cada regla. */
  protected versionDe(r: Regla): number {
    const vs = this.flujo.versionesReglas();
    let ultima = 1;
    for (let i = 1; i < vs.length; i++) if (vs[i].efectos[r.id] !== vs[i - 1].efectos[r.id]) ultima = vs[i].version;
    return ultima;
  }

  protected cambiarEfecto(id: string, e: Efecto): void {
    this.borradorEfectos.update((m) => ({ ...m, [id]: e }));
  }

  protected cambiarParametro(k: keyof Parametros, valor: string): void {
    const n = parseFloat(valor);
    if (Number.isFinite(n)) this.borradorParametros.update((p) => ({ ...p, [k]: n }));
  }

  protected descartar(): void {
    this.borradorEfectos.set({ ...this.vigente().efectos });
    this.borradorParametros.set({ ...this.vigente().parametros });
    this.simulado.set(null);
  }

  // ---------------------------------------------------------------- simulación e impacto
  protected readonly analizados = computed(() => this.expedientes.lista().filter((e) => e.dictamen));
  protected readonly expPrueba = signal<string>('');
  protected readonly simulado = signal<string | null>(null);
  protected readonly simulacion = computed(() => {
    const e = this.analizados().find((x) => x.id === this.simulado());
    if (!e) return null;
    return { e, s: simular(e.dictamen!, this.vigente(), { efectos: this.borradorEfectos(), parametros: this.borradorParametros() }) };
  });
  protected readonly impacto = computed(() => this.analizados().map((e) => ({
    e, s: simular(e.dictamen!, this.vigente(), { efectos: this.borradorEfectos(), parametros: this.borradorParametros() }),
  })).filter((x) => x.s.base !== x.s.simulada || x.s.cambios.length));

  protected titulo(e: { id: string; dictamen?: { inmueble: string } }): string {
    return e.dictamen?.inmueble || `Expediente ${e.id}`;
  }

  protected probar(): void {
    this.simulado.set(this.expPrueba() || this.analizados()[0]?.id || null);
  }

  // ---------------------------------------------------------------- publicar
  protected motivo = '';
  protected fuente = 'Guía de criterios del comité del reto';
  protected readonly error = signal('');
  protected readonly aviso = signal('');

  protected publicar(): void {
    if (!this.cambios().length) { this.error.set('El borrador no tiene cambios.'); return; }
    if (!this.motivo.trim()) { this.error.set('Escribe el motivo del cambio.'); return; }
    const v = this.flujo.publicarReglas(this.borradorEfectos(), this.borradorParametros(), this.motivo.trim(), this.fuente.trim(), this.cambios());
    this.error.set('');
    this.aviso.set(`Se publicó la versión ${v.version}. Los análisis nuevos la registran; los anteriores conservan la suya.`);
    this.motivo = '';
    this.simulado.set(null);
  }
}
