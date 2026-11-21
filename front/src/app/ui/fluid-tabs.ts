// Pestañas con píldora que se desliza (versión Angular de «fluid-tabs» de Watermelon UI).
//
// La píldora blanca se mueve hasta la pestaña activa con una curva de resorte (rigidez 280,
// amortiguamiento 25, masa 0.8, como el original con `motion`), calculada como `linear()`.
// Al activarse, la etiqueta se desenfoca un instante y el icono crece un poco.
// Teclado: flechas izquierda y derecha, Inicio y Fin (patrón de pestañas de WAI-ARIA).
import {
  AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, effect, inject, input, model,
  signal, viewChild, viewChildren,
} from '@angular/core';

/** `corto`: texto visible si la etiqueta es larga; la etiqueta completa queda en el título (tooltip). */
export interface PestanaFluida { id: string; etiqueta: string; corto?: string; icono: string; cuenta?: number }

@Component({
  selector: 'app-fluid-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="riel" #riel role="tablist" [attr.aria-label]="etiqueta()" (keydown)="teclado($event)" (scroll)="bordes()"
         [class.mas-izq]="masIzq()" [class.mas-der]="masDer()">
      <span class="pildora" aria-hidden="true" [class.lista]="medida()"
            [style.transform]="'translateX(' + pildora().x + 'px)'" [style.width.px]="pildora().ancho"></span>
      @for (p of pestanas(); track p.id) {
        <button #boton type="button" role="tab" class="pestana" [class.activa]="activa() === p.id"
                [id]="'tab-' + p.id" [attr.aria-selected]="activa() === p.id" [attr.aria-controls]="controla()"
                [tabIndex]="activa() === p.id ? 0 : -1" (click)="elegir(p.id)" [title]="p.etiqueta">
          <span class="contenido" [class.destello]="destello() === p.id">
            <span class="ms" [class.lleno]="activa() === p.id" aria-hidden="true">{{ p.icono }}</span>
            <span class="texto">{{ p.corto ?? p.etiqueta }}</span>
            @if (p.cuenta !== undefined) { <span class="sr-only">, </span><span class="cuenta">{{ p.cuenta }}</span> }
          </span>
        </button>
      }
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .riel {
      position: relative; display: flex; align-items: center; gap: .25rem; width: max-content; max-width: 100%;
      padding: .25rem; border-radius: 999px; background: #EDEFEF; border: 1.6px solid #E6E9E9;
      overflow-x: auto; scrollbar-width: none; scroll-behavior: smooth;
    }
    .riel::-webkit-scrollbar { display: none; }
    /* Desvanecido en los bordes cuando hay pestañas fuera de la vista. */
    .riel.mas-der { mask-image: linear-gradient(to right, #000 calc(100% - 3rem), transparent); }
    .riel.mas-izq { mask-image: linear-gradient(to left, #000 calc(100% - 3rem), transparent); }
    .riel.mas-izq.mas-der { mask-image: linear-gradient(to right, transparent, #000 3rem, #000 calc(100% - 3rem), transparent); }
    .pildora {
      position: absolute; left: 0; top: .25rem; bottom: .25rem; border-radius: 999px; pointer-events: none;
      background: linear-gradient(to bottom, #FEFEFE, rgba(249, 250, 251, .8));
      border: 1px solid rgba(254, 254, 254, .9); box-shadow: 0 1px 2px rgba(4, 33, 31, .08), 0 1px 1px rgba(4, 33, 31, .04);
      opacity: 0;
    }
    .pildora.lista {
      opacity: 1;
      transition: transform .465s cubic-bezier(.3, 1.15, .5, 1), width .465s cubic-bezier(.3, 1.15, .5, 1);
      transition-timing-function: linear(0, 0.054, 0.175, 0.322, 0.468, 0.6, 0.711, 0.799, 0.867, 0.917, 0.953, 0.977,
        0.992, 1.001, 1.006, 1.008, 1.008, 1.008, 1.007, 1.005, 1.004, 1.003, 1.002, 1.002, 1);
    }
    .pestana {
      position: relative; flex: none; border: 0; background: transparent; cursor: pointer; border-radius: 999px;
      padding: .65rem .8rem; color: var(--texto-suave); font-weight: 600; font-size: .95rem;
    }
    .pestana:hover { color: var(--texto); }
    .pestana:focus-visible { outline: 2px solid var(--texto); outline-offset: -2px; }
    .pestana.activa { color: var(--texto); font-weight: 700; }
    .contenido { position: relative; z-index: 1; display: flex; align-items: center; gap: .55rem; white-space: nowrap; letter-spacing: -0.01em; }
    .ms { font-size: 1.35rem; transition: transform .25s cubic-bezier(.3, 1.6, .5, 1), color .2s; }
    .activa .ms { transform: scale(1.03); color: var(--rojo-accion); }
    .cuenta { font-size: .75rem; font-weight: 600; min-width: 1.4rem; text-align: center; padding: .05rem .4rem;
      border-radius: 99px; background: rgba(4, 33, 31, .07); color: var(--texto); }
    .activa .cuenta { background: var(--rojo-suave); color: var(--rojo-texto); }
    .destello { animation: destello .3s ease-out; }
    @keyframes destello { 0% { filter: blur(0); } 50% { filter: blur(4px); } 100% { filter: blur(0); } }
    @media (max-width: 640px) { .pestana { padding: .55rem .75rem; font-size: .88rem; } .contenido { gap: .4rem; } }
    @media (prefers-reduced-motion: reduce) { .pildora.lista { transition: none; } .destello { animation: none; } }
  `,
})
export class FluidTabs implements AfterViewInit {
  readonly pestanas = input.required<PestanaFluida[]>();
  readonly activa = model.required<string>();
  readonly etiqueta = input('Secciones');
  readonly controla = input<string | null>(null);

  private readonly riel = viewChild.required<ElementRef<HTMLElement>>('riel');
  private readonly botones = viewChildren<ElementRef<HTMLButtonElement>>('boton');
  protected readonly pildora = signal({ x: 0, ancho: 0 });
  protected readonly medida = signal(false);
  protected readonly destello = signal<string | null>(null);
  protected readonly masIzq = signal(false);
  protected readonly masDer = signal(false);
  private readonly destruir = inject(DestroyRef);

  constructor() {
    // Reubica la píldora cuando cambia la pestaña activa o la lista de pestañas.
    effect(() => {
      this.activa();
      this.pestanas();
      this.botones();
      queueMicrotask(() => this.medir());
    });
  }

  ngAfterViewInit(): void {
    const obs = new ResizeObserver(() => this.medir());
    obs.observe(this.riel().nativeElement);
    this.destruir.onDestroy(() => obs.disconnect());
    // Las fuentes cambian el ancho de las etiquetas: medir otra vez cuando terminen de cargar.
    document.fonts?.ready.then(() => this.medir());
  }

  private medir(): void {
    const i = this.pestanas().findIndex((p) => p.id === this.activa());
    const boton = this.botones()[i]?.nativeElement;
    if (!boton) return;
    this.pildora.set({ x: boton.offsetLeft, ancho: boton.offsetWidth });
    if (!this.medida()) requestAnimationFrame(() => this.medida.set(true)); // sin animación la primera vez
    const riel = this.riel().nativeElement;
    if (boton.offsetLeft < riel.scrollLeft || boton.offsetLeft + boton.offsetWidth > riel.scrollLeft + riel.clientWidth) {
      riel.scrollTo({ left: boton.offsetLeft - riel.clientWidth / 2 + boton.offsetWidth / 2 });
    }
    this.bordes();
  }

  protected bordes(): void {
    const r = this.riel().nativeElement;
    this.masIzq.set(r.scrollLeft > 2);
    this.masDer.set(r.scrollLeft + r.clientWidth < r.scrollWidth - 2);
  }

  protected elegir(id: string): void {
    if (id === this.activa()) return;
    this.activa.set(id);
    this.destello.set(null);
    requestAnimationFrame(() => this.destello.set(id));
  }

  protected teclado(ev: KeyboardEvent): void {
    const ids = this.pestanas().map((p) => p.id);
    const i = ids.indexOf(this.activa());
    const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: ids.length - 1 }[ev.key];
    if (destino === undefined) return;
    ev.preventDefault();
    const j = (destino + ids.length) % ids.length;
    this.elegir(ids[j]);
    queueMicrotask(() => this.botones()[j]?.nativeElement.focus());
  }
}
