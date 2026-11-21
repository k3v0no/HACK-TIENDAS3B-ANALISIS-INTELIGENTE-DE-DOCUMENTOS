// Permisos y vigencias del gestor: lista ordenada por vencimiento, con la fecha de referencia
// usada en el cálculo para poder explicar cada alerta.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EstadoVigencia, Permiso, VIGENCIA, fechaCorta, permisos } from '../../core/analisis';
import { ExpedientesService } from '../../core/expedientes.service';
import { FlujoService } from '../../core/flujo.service';
import { DOC, TipoDocumento } from '../../core/modelos';
import { Encabezado } from '../../ui/ui';

const ORDEN: Record<EstadoVigencia, number> = { vencido: 0, proximo: 1, no_acreditada: 2, vigente: 3, no_aplicable: 4 };
const REGLA: Partial<Record<string, string>> = { 'Alineamiento y Número Oficial': 'A2', 'Uso de Suelo': 'U3', Predial: 'P2' };

@Component({
  selector: 'app-permisos',
  imports: [Encabezado, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-encabezado icono="event_available" titulo="Permisos y vigencias"
      [descripcion]="'Ordenados por vencimiento. «Próximo a vencer» = ' + dias() + ' días o menos, según las reglas vigentes.'" />

    <div class="resumen">
      @for (k of estados; track k) {
        <button type="button" class="contador" [class]="'contador ' + VIGENCIA[k].clase" [class.activo]="filtro() === k"
                [attr.aria-pressed]="filtro() === k" (click)="filtro.set(filtro() === k ? null : k)">
          <b>{{ conteo()[k] }}</b><span><span class="ms" aria-hidden="true">{{ VIGENCIA[k].icono }}</span>{{ VIGENCIA[k].texto }}</span>
        </button>
      }
    </div>
    @if (aviso()) { <div class="aviso exito" role="status"><span class="ms" aria-hidden="true">check_circle</span>{{ aviso() }}</div> }

    <ol class="lista">
      @for (p of visibles(); track p.exp.id + p.documento.id) {
        <li class="tarjeta permiso" [class]="'tarjeta permiso ' + p.estado">
          <div class="fecha" [attr.aria-label]="p.vence ? 'Vence el ' + corta(p.vence) : 'Sin fecha de vencimiento'">
            @if (p.vence) { <b>{{ p.vence.getDate() }}</b><span>{{ mes(p.vence) }}</span><small>{{ p.vence.getFullYear() }}</small> }
            @else { <span class="ms" aria-hidden="true">event_busy</span><small>Sin fecha</small> }
          </div>
          <div class="cuerpo">
            <p class="arriba"><span class="badge" [class]="'badge ' + VIGENCIA[p.estado].clase"><span class="ms" aria-hidden="true">{{ VIGENCIA[p.estado].icono }}</span>{{ VIGENCIA[p.estado].texto }}</span>
              @if (p.dias !== null) { <span class="suave pequeno">{{ p.dias < 0 ? 'venció hace ' + (-p.dias) + ' días' : 'faltan ' + p.dias + ' días' }}</span> }</p>
            <h2><span class="ms" aria-hidden="true">{{ icono(p.documento.tipo) }}</span>{{ p.documento.tipo }}</h2>
            <p><a [routerLink]="['/gestor/expediente', p.exp.id]">{{ titulo(p) }}</a></p>
            <p class="suave pequeno">{{ p.autoridad ?? 'Autoridad no identificada' }}. Emitido: {{ corta(p.emision) }}.</p>
            <p class="pequeno explica"><span class="ms" aria-hidden="true">calculate</span>{{ p.explicacion }} Fecha de referencia: {{ corta(p.referencia) }}.</p>
          </div>
          <div class="accion">
            @if (tareaAbierta(p); as t) {
              <span class="suave pequeno"><span class="ms" aria-hidden="true">assignment</span>Tarea abierta: {{ t.estado }}</span>
            } @else if (p.estado === 'vencido' || p.estado === 'no_acreditada' || p.estado === 'proximo') {
              <button type="button" class="btn chico" (click)="crearTarea(p)"><span class="ms" aria-hidden="true">add_task</span>Crear tarea de renovación</button>
            }
          </div>
        </li>
      } @empty {
        <li class="tarjeta vacio"><span class="ms" aria-hidden="true">event_available</span>
          <p>{{ todos().length ? 'Ningún permiso con ese estado.' : 'Aún no hay permisos analizados.' }}</p></li>
      }
    </ol>
  `,
  styles: `
    .resumen { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .6rem; margin-bottom: 1.2rem; }
    .contador { display: grid; gap: .2rem; text-align: left; padding: .8rem 1rem; border-radius: var(--radio); border: 1px solid var(--borde);
      background: var(--superficie); cursor: pointer; color: var(--texto); box-shadow: var(--sombra); }
    .contador b { font-family: var(--titulos); font-size: 1.6rem; line-height: 1; }
    .contador span { display: inline-flex; gap: .3rem; align-items: center; font-size: .85rem; font-weight: 600; color: var(--texto-suave); }
    .contador.activo { border: 2px solid var(--texto); }
    .contador.no_cumple b { color: var(--rojo-accion); } .contador.revisar b { color: var(--ambar-texto); } .contador.cumple b { color: var(--verde-texto); }
    .aviso { margin-bottom: 1rem; }
    .lista { list-style: none; margin: 0; padding: 0; display: grid; gap: .7rem; }
    .permiso { display: grid; grid-template-columns: 5rem 1fr auto; gap: 1rem; align-items: center; margin: 0 !important; border-left: 5px solid var(--borde-fuerte); }
    .permiso.vencido { border-left-color: var(--rojo); } .permiso.proximo, .permiso.no_acreditada { border-left-color: var(--ambar); }
    .permiso.vigente { border-left-color: var(--verde); }
    .fecha { display: grid; justify-items: center; text-align: center; padding: .5rem; border-radius: var(--radio-s); background: var(--gris); }
    .fecha b { font-family: var(--titulos); font-size: 1.6rem; line-height: 1; }
    .fecha span { font-weight: 600; text-transform: capitalize; font-size: .85rem; }
    .fecha small { color: var(--texto-suave); font-size: .75rem; }
    .fecha .ms { font-size: 1.6rem; color: var(--texto-suave); }
    .cuerpo { display: grid; gap: .25rem; min-width: 0; }
    .arriba { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
    .cuerpo h2 { font-size: 1.02rem; display: flex; gap: .4rem; align-items: center; }
    .cuerpo a { color: var(--texto); font-weight: 600; }
    .explica { display: flex; gap: .3rem; align-items: flex-start; }
    .explica .ms { color: var(--texto-suave); font-size: 1.05rem; }
    .accion span { display: inline-flex; gap: .3rem; align-items: center; }
    .vacio { display: grid; justify-items: center; gap: .4rem; padding: 2rem; }
    .vacio .ms { font-size: 2rem; color: var(--borde-fuerte); }
    @media (max-width: 900px) { .resumen { grid-template-columns: repeat(2, 1fr); } .permiso { grid-template-columns: 4.2rem 1fr; } .accion { grid-column: 1 / -1; } }
  `,
})
export class Permisos {
  private readonly expedientes = inject(ExpedientesService);
  private readonly flujo = inject(FlujoService);
  protected readonly VIGENCIA = VIGENCIA;
  protected readonly estados = Object.keys(ORDEN) as EstadoVigencia[];
  protected readonly corta = fechaCorta;
  protected readonly filtro = signal<EstadoVigencia | null>(null);
  protected readonly aviso = signal('');
  protected readonly dias = computed(() => this.flujo.reglasVigentes().parametros.diasAvisoVencimiento);

  protected readonly todos = computed<Permiso[]>(() => this.expedientes.lista()
    .flatMap((e) => permisos(e, this.dias()))
    .sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || (a.vence?.getTime() ?? Infinity) - (b.vence?.getTime() ?? Infinity)));
  protected readonly conteo = computed(() => {
    const c = Object.fromEntries(this.estados.map((k) => [k, 0])) as Record<EstadoVigencia, number>;
    for (const p of this.todos()) c[p.estado]++;
    return c;
  });
  protected readonly visibles = computed(() => this.todos().filter((p) => !this.filtro() || p.estado === this.filtro()));

  constructor() {
    this.expedientes.refrescar();
  }

  protected titulo(p: Permiso): string { return ExpedientesService.titulo(p.exp); }
  protected mes(d: Date): string { return d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', ''); }
  protected icono(tipo: string): string { return DOC[tipo as TipoDocumento]?.icono ?? 'description'; }

  protected tareaAbierta(p: Permiso) {
    return this.flujo.abiertas(p.exp.id).find((t) => t.documento === p.documento.tipo);
  }

  protected crearTarea(p: Permiso): void {
    const tipo = p.documento.tipo as TipoDocumento;
    const reglaId = REGLA[tipo] ?? '';
    const h = p.exp.dictamen?.hallazgos.find((x) => x.reglaId === reglaId);
    const causa = p.estado === 'vencido' ? 'Documento vencido' : p.estado === 'proximo' ? 'Próximo a vencer' : 'Vigencia no acreditada';
    this.flujo.crearTarea({ exp: p.exp.id, tipo: 'aclaracion', area: 'Trámites', titulo: `Renovar ${tipo.toLowerCase()}`, causa,
      documento: tipo, hallazgo: h ? { id: h.id, titulo: h.titulo, reglaId: h.reglaId } : undefined,
      nota: `${causa}. ${p.explicacion}` });
    this.aviso.set(`Tarea creada en «Trámites»: renovar ${tipo.toLowerCase()} de ${this.titulo(p)}.`);
  }
}
