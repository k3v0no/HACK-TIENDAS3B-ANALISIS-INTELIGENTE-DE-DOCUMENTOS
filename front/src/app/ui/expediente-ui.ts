// Piezas de expediente que cada rol acomoda a su manera.
import {
  ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ExpedientesService } from '../core/expedientes.service';
import { Dictamen, Evidencia, Expediente, USO_PREVISTO } from '../core/modelos';
import { Visibilidad } from '../core/visibilidad';
import { Estado, Fragmento, pct } from './ui';
import { Visor } from './visor';

/** Encabezado de expediente: volver, título, folio, uso previsto y recomendación. */
@Component({
  selector: 'app-cabecera-expediente',
  imports: [RouterLink, Estado],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="volver" [routerLink]="volver()"><span class="ms" aria-hidden="true">arrow_back</span>{{ volverTexto() }}</a>
    <header class="cabeza">
      <div class="texto">
        <p class="vista"><span class="ms" aria-hidden="true">{{ icono() }}</span>{{ vista() }}</p>
        <h1>{{ titulo() }}</h1>
        <p class="meta">
          <span><span class="ms" aria-hidden="true">tag</span>Folio {{ exp().id }}</span>
          <span><span class="ms" aria-hidden="true">storefront</span>{{ uso }}</span>
          @if (corrida(); as c) { <span><span class="ms" aria-hidden="true">history</span>Análisis {{ c }}</span> }
        </p>
      </div>
      <div class="lado">
        <app-estado [valor]="estado()" />
        @if (exp().dictamen; as d) { <span class="suave pequeno">Confianza {{ nivel(d) }} ({{ pct(d.confianza) }})</span> }
        <ng-content />
      </div>
    </header>
  `,
  styles: `
    :host { display: block; margin-bottom: 1.4rem; }
    .volver { display: inline-flex; align-items: center; gap: .4rem; color: var(--texto); text-decoration: none; font-weight: 600;
      font-size: .92rem; padding: .35rem .6rem .35rem .2rem; border-radius: 8px; margin-bottom: .8rem; }
    .volver:hover { background: var(--gris); }
    .cabeza { display: flex; gap: 1.2rem; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; }
    .texto { flex: 1 1 24rem; min-width: 0; }
    .vista { display: inline-flex; align-items: center; gap: .35rem; font-size: .85rem; font-weight: 600; color: var(--rojo-texto); margin-bottom: .3rem; }
    h1 { font-size: clamp(1.5rem, 3vw, 2.1rem); overflow-wrap: anywhere; }
    .meta { display: flex; flex-wrap: wrap; gap: .4rem 1rem; margin-top: .5rem; color: var(--texto-suave); font-size: .9rem; }
    .meta > span { display: inline-flex; align-items: center; gap: .3rem; }
    .lado { display: grid; justify-items: end; gap: .35rem; }
    @media (max-width: 640px) { .lado { justify-items: start; } }
  `,
})
export class CabeceraExpediente {
  readonly exp = input.required<Expediente>();
  readonly vista = input.required<string>();
  readonly icono = input('folder_open');
  readonly volver = input.required<string>();
  readonly volverTexto = input('Volver');
  protected readonly uso = USO_PREVISTO;
  protected readonly pct = pct;
  protected readonly titulo = computed(() => ExpedientesService.titulo(this.exp()));
  protected readonly estado = computed(() => ExpedientesService.estado(this.exp()));
  protected readonly corrida = computed(() => this.exp().corridas.filter((c) => c.dictamen).length || null);
  protected nivel(d: Dictamen): string { return d.nivelConfianza; }
}

/** Lista compacta de citas. Oculta las que salen de datos sin permiso. */
@Component({
  selector: 'app-citas',
  imports: [Fragmento],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (ev of evidencias(); track $index) {
      <div class="cita">
        @if (visible.evidencia(dictamen(), ev)) {
          <app-fragmento [ev]="ev" [origen]="nombreDoc(ev.documento)" />
          @if (abrible() && visible.documentos()) {
            <button type="button" class="btn chico" (click)="abrir.emit([ev])"><span class="ms" aria-hidden="true">plagiarism</span>Ver en el documento</button>
          }
        } @else {
          <p class="oculto-dato pequeno"><span class="ms" aria-hidden="true">lock</span> Fragmento de {{ nombreDoc(ev.documento) }} oculto por permisos</p>
        }
      </div>
    } @empty { <p class="suave pequeno">Sin cita: el dato no se encontró en los documentos.</p> }
  `,
  styles: `:host { display: grid; gap: .6rem; } .cita { display: grid; gap: .4rem; justify-items: start; } app-fragmento { width: 100%; }`,
})
export class Citas {
  protected readonly visible = inject(Visibilidad);
  readonly evidencias = input.required<Evidencia[]>();
  readonly dictamen = input.required<Dictamen | undefined>();
  readonly abrible = input(true);
  readonly abrir = output<Evidencia[]>();
  protected nombreDoc(id: string): string {
    return this.dictamen()?.documentos.find((d) => d.id === id)?.tipo ?? id;
  }
}

/** Cajón lateral con la página original y el fragmento resaltado. Con dos citas, lado a lado. */
@Component({
  selector: 'app-cajon-evidencia',
  imports: [Visor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dlg class="cajon" [class.doble]="evidencias().length > 1" aria-labelledby="cajon-t" (close)="cerrar.emit()">
      <header>
        <h2 id="cajon-t"><span class="ms" aria-hidden="true">plagiarism</span>{{ titulo() }}</h2>
        <button type="button" class="btn chico fantasma" (click)="dlg.close()" aria-label="Cerrar"><span class="ms" aria-hidden="true">close</span></button>
      </header>
      <div class="visores">
        @for (ev of evidencias(); track $index) {
          <app-visor [ev]="ev" [documento]="doc(ev)" [urlBase]="url" />
        }
      </div>
    </dialog>
  `,
  styles: `
    .cajon { margin: 0 0 0 auto; height: 100vh; max-height: 100vh; width: min(34rem, 100vw); border: 0; padding: 1.2rem;
      box-shadow: -10px 0 30px rgba(4, 33, 31, .15); overflow-y: auto; color: var(--texto); }
    .cajon.doble { width: min(64rem, 100vw); }
    .cajon::backdrop { background: rgba(4, 33, 31, .35); }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    h2 { font-size: 1.15rem; display: flex; gap: .4rem; align-items: center; }
    .visores { display: grid; gap: 1.2rem; }
    .doble .visores { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    @media (max-width: 760px) { .doble .visores { grid-template-columns: 1fr; } }
  `,
})
export class CajonEvidencia {
  private readonly expedientes = inject(ExpedientesService);
  readonly evidencias = input.required<Evidencia[]>();
  readonly dictamen = input.required<Dictamen | undefined>();
  readonly titulo = input('Evidencia en el documento');
  readonly cerrar = output<void>();
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly url = (b: string, d: string, p: number) => this.expedientes.imagenPagina(b, d, p);

  constructor() {
    effect(() => {
      const abierto = this.evidencias().length > 0;
      const d = this.dlg().nativeElement;
      if (abierto && !d.open) d.showModal();
      if (!abierto && d.open) d.close();
    });
  }

  protected doc(ev: Evidencia) {
    return this.dictamen()?.documentos.find((d) => d.id === ev.documento);
  }
}
