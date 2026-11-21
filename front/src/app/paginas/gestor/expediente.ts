// Permisos de un inmueble para el gestor: cada documento administrativo con sus datos y la cita
// de donde salen, más las tareas abiertas de ese inmueble.
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { VIGENCIA, fechaCorta, permisos } from '../../core/analisis';
import { ExpedientesService } from '../../core/expedientes.service';
import { ETIQUETA_ESTADO, FlujoService } from '../../core/flujo.service';
import { DOC, Evidencia, TipoDocumento } from '../../core/modelos';
import { Visibilidad } from '../../core/visibilidad';
import { CabeceraExpediente, CajonEvidencia } from '../../ui/expediente-ui';
import { fecha } from '../../ui/ui';

@Component({
  selector: 'app-expediente-gestor',
  imports: [RouterLink, CabeceraExpediente, CajonEvidencia],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (exp(); as e) {
      <app-cabecera-expediente [exp]="e" vista="Vista del gestor de trámites" icono="assignment" volver="/gestor/permisos" volverTexto="Permisos y vigencias" />

      <div class="rejilla">
        <section aria-labelledby="perm-t">
          <h2 id="perm-t" class="titulo"><span class="ms" aria-hidden="true">verified</span>Permisos del inmueble</h2>
          @for (p of permisos(); track p.documento.id) {
            <article class="tarjeta permiso">
              <header>
                <h3><span class="ms" aria-hidden="true">{{ icono(p.documento.tipo) }}</span>{{ p.documento.tipo }}</h3>
                <span class="badge" [class]="'badge ' + VIGENCIA[p.estado].clase"><span class="ms" aria-hidden="true">{{ VIGENCIA[p.estado].icono }}</span>{{ VIGENCIA[p.estado].texto }}</span>
              </header>
              <p class="suave pequeno">{{ p.explicacion }} Vence: {{ corta(p.vence) }}. Referencia: {{ corta(p.referencia) }}.</p>
              <dl>
                @for (x of p.datos; track x.nombre) {
                  <div><dt>{{ x.campo }}</dt>
                    <dd>@if (!visible.campo(x.campo)) { <span class="oculto-dato">{{ visible.OCULTO }}</span> }
                      @else { {{ x.valor ?? 'No se indica' }}
                        @if (x.evidencia.length) { <button type="button" class="fuente" (click)="citas.set(x.evidencia)"><span class="ms" aria-hidden="true">link</span>Ver fragmento</button> } }
                    </dd></div>
                }
              </dl>
            </article>
          } @empty { <p class="suave">{{ e.dictamen ? 'Este expediente no tiene documentos administrativos analizados.' : 'Este expediente aún no tiene análisis.' }}</p> }
        </section>

        <section aria-labelledby="tar-t">
          <h2 id="tar-t" class="titulo"><span class="ms" aria-hidden="true">assignment</span>Trámites de este inmueble</h2>
          @for (t of tareas(); track t.id) {
            <article class="tarjeta tarea">
              <p class="arriba"><span class="badge neutra">{{ ETIQUETA_ESTADO[t.estado] }}</span><span class="suave pequeno">{{ t.area }}</span></p>
              <b>{{ t.titulo }}</b>
              <p class="suave pequeno">{{ t.causa }}@if (t.documento) {. Documento: {{ t.documento }}}. Desde {{ fecha(t.fecha, false) }}.</p>
              @if (t.solicitud) { <p class="solicitud">«{{ t.solicitud }}»</p> }
            </article>
          } @empty { <p class="suave">Sin trámites para este inmueble.</p> }
          <a class="btn chico" routerLink="/gestor/tramites"><span class="ms" aria-hidden="true">view_kanban</span>Ir al tablero de trámites</a>
        </section>
      </div>
      <app-cajon-evidencia [evidencias]="citas()" [dictamen]="e.dictamen" (cerrar)="citas.set([])" />
    } @else {
      <section class="tarjeta"><h1>No encontramos ese inmueble</h1><p class="suave">Vuelve a <a routerLink="/gestor/permisos">Permisos y vigencias</a>.</p></section>
    }
  `,
  styles: `
    .rejilla { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 1.4rem; align-items: start; }
    .titulo { font-size: 1.1rem; display: flex; gap: .45rem; align-items: center; margin-bottom: .8rem; }
    .permiso header { display: flex; justify-content: space-between; gap: .8rem; align-items: center; flex-wrap: wrap; margin-bottom: .4rem; }
    .permiso h3 { font-size: 1.02rem; display: flex; gap: .4rem; align-items: center; }
    dl { margin: .7rem 0 0; border: 1px solid var(--borde); border-radius: var(--radio-s); }
    dl > div { display: grid; grid-template-columns: 11rem 1fr; gap: .6rem; padding: .45rem .7rem; border-bottom: 1px solid var(--borde); }
    dl > div:last-child { border-bottom: 0; }
    dt { font-size: .82rem; color: var(--texto-suave); font-weight: 600; }
    dd { margin: 0; font-size: .9rem; overflow-wrap: anywhere; }
    .fuente { border: 0; background: none; padding: 0; margin-left: .4rem; color: var(--rojo-texto); font-size: .8rem; font-weight: 600; cursor: pointer; display: inline-flex; gap: .2rem; align-items: center; }
    .tarea { display: grid; gap: .3rem; }
    .arriba { display: flex; gap: .5rem; align-items: center; }
    .solicitud { font-size: .88rem; background: #FAFBFB; border-left: 3px solid var(--borde-fuerte); padding: .4rem .6rem; }
    section > .btn { margin-top: .8rem; }
    @media (max-width: 960px) { .rejilla { grid-template-columns: 1fr; } dl > div { grid-template-columns: 1fr; gap: .1rem; } }
  `,
})
export class ExpedienteGestor {
  readonly id = input.required<string>();
  private readonly expedientes = inject(ExpedientesService);
  private readonly flujo = inject(FlujoService);
  protected readonly visible = inject(Visibilidad);
  protected readonly VIGENCIA = VIGENCIA;
  protected readonly ETIQUETA_ESTADO = ETIQUETA_ESTADO;
  protected readonly corta = fechaCorta;
  protected readonly fecha = fecha;
  protected readonly citas = signal<Evidencia[]>([]);

  protected readonly exp = computed(() => this.expedientes.lista().find((e) => e.id === this.id()));
  protected readonly permisos = computed(() => (this.exp() ? permisos(this.exp()!, this.flujo.reglasVigentes().parametros.diasAvisoVencimiento) : []));
  protected readonly tareas = computed(() => this.flujo.tareas().filter((t) => t.exp === this.id()));

  constructor() {
    this.expedientes.refrescar();
  }

  protected icono(tipo: string): string { return DOC[tipo as TipoDocumento]?.icono ?? 'description'; }
}
