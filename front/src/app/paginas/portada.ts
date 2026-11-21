import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CuentasService, TIPO_ARRENDADOR, TIPO_TRABAJADOR, TipoCuenta } from '../core/cuentas.service';
import { DOC, TIPOS_DOCUMENTO } from '../core/modelos';
import { rutaInicio } from '../core/navegacion';
import { Estado } from '../ui/ui';

interface Acceso { tipo: TipoCuenta; icono: string; color: 'rojo' | 'verde'; para: string; puntos: string[] }

@Component({
  selector: 'app-portada',
  imports: [FormsModule, Estado],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './portada.html',
  styleUrl: './portada.css',
})
export class Portada {
  private readonly cuentas = inject(CuentasService);
  private readonly router = inject(Router);

  protected readonly accesos: Acceso[] = [
    { tipo: TIPO_TRABAJADOR, icono: 'badge', color: 'rojo', para: 'Para el equipo de Tiendas 3B.',
      puntos: ['Revisa expedientes y hallazgos', 'Consulta la evidencia en el documento', 'Ve solo lo que permite tu área'] },
    { tipo: TIPO_ARRENDADOR, icono: 'real_estate_agent', color: 'verde', para: 'Para quien ofrece un inmueble en renta.',
      puntos: ['Sube tus cuatro documentos por pasos', 'Ve cuáles ya cargaste', 'Consulta en qué va tu trámite'] },
  ];
  protected readonly tipos = TIPOS_DOCUMENTO;
  protected readonly DOC = DOC;
  protected readonly TIPO_ARRENDADOR = TIPO_ARRENDADOR;

  protected readonly elegido = signal<TipoCuenta | null>(null);
  protected readonly pestana = signal<'ingresar' | 'crear'>('ingresar');
  protected readonly error = signal('');
  protected readonly ocupado = signal(false);

  protected usuario = '';
  protected clave = '';
  protected nombreNuevo = '';
  protected usuarioNuevo = '';
  protected claveNueva = '';

  protected elegir(tipo: TipoCuenta): void {
    this.elegido.set(tipo);
    this.pestana.set('ingresar');
    this.error.set('');
    setTimeout(() => document.getElementById('login-usuario')?.focus());
  }

  protected acceso(tipo: TipoCuenta): Acceso {
    return this.accesos.find((a) => a.tipo === tipo)!;
  }

  protected async ingresar(): Promise<void> {
    if (!this.usuario.trim() || !this.clave) {
      this.error.set('Escribe tu usuario y contraseña.');
      return;
    }
    this.ocupado.set(true);
    const cuenta = await this.cuentas.autenticar(this.usuario, this.clave, this.elegido()!);
    this.ocupado.set(false);
    if (!cuenta) {
      this.error.set('Usuario o contraseña incorrectos. Revisa los datos e inténtalo de nuevo.');
      return;
    }
    this.router.navigateByUrl(rutaInicio(cuenta));
  }

  protected async crearCuenta(): Promise<void> {
    if (!this.nombreNuevo.trim() || !this.usuarioNuevo.trim() || this.claveNueva.length < 6) {
      this.error.set('Completa tu nombre y usuario, y usa una contraseña de al menos 6 caracteres.');
      return;
    }
    this.ocupado.set(true);
    try {
      const cuenta = await this.cuentas.registrarArrendador(this.usuarioNuevo, this.nombreNuevo, this.claveNueva);
      this.router.navigateByUrl(rutaInicio(cuenta));
    } catch (e) {
      this.error.set(`No se pudo crear la cuenta: ${(e as Error).message}.`);
    } finally {
      this.ocupado.set(false);
    }
  }
}
