import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CuentasService } from '../../core/cuentas.service';
import { ExpedientesService } from '../../core/expedientes.service';
import { TipoDocumento } from '../../core/modelos';
import { AsistenteCarga } from '../../ui/asistente-carga';
import { Encabezado } from '../../ui/ui';

@Component({
  selector: 'app-cargar',
  imports: [Encabezado, AsistenteCarga],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-encabezado icono="upload_file" titulo="Cargar expediente"
      descripcion="Sube los documentos de un mismo inmueble, uno por paso. La dirección se toma de los propios documentos." />
    @if (conectado() === false) {
      <div class="aviso alerta"><span class="ms" aria-hidden="true">cloud_off</span>
        <span>No hay conexión con el servicio de análisis. El expediente se guarda y queda en la bandeja como «Sin analizar»;
          lánzalo cuando el servicio esté encendido.</span></div>
    }
    @if (error()) { <div class="aviso error" role="alert"><span class="ms" aria-hidden="true">error</span>{{ error() }}</div> }
    <app-asistente-carga [etiquetaEnvio]="conectado() === false ? 'Guardar expediente' : 'Enviar a análisis'"
      [iconoEnvio]="conectado() === false ? 'save' : 'play_arrow'" [ocupado]="ocupado()" (enviar)="enviar($event)" />
  `,
  styles: `.aviso { margin-bottom: 1rem; }`,
})
export class Cargar {
  private readonly cuentas = inject(CuentasService);
  private readonly expedientes = inject(ExpedientesService);
  private readonly router = inject(Router);
  protected readonly conectado = this.expedientes.conectado;
  protected readonly ocupado = signal(false);
  protected readonly error = signal('');

  constructor() {
    this.expedientes.revisarConexion(true);
  }

  protected async enviar(docs: Partial<Record<TipoDocumento, File[]>>): Promise<void> {
    this.ocupado.set(true);
    this.error.set('');
    try {
      const exp = await this.expedientes.recibir(docs, '3b', this.cuentas.cuenta()!.usuario);
      if (await this.expedientes.revisarConexion(true)) {
        await this.expedientes.iniciarAnalisis(exp.id).catch(() => undefined); // el detalle muestra el motivo y permite reintentar
      }
      this.router.navigate(['/trabajador/expediente', exp.id]);
    } catch (e) {
      this.error.set(`No se pudo guardar el expediente: ${(e as Error).message}.`);
    } finally {
      this.ocupado.set(false);
    }
  }
}
