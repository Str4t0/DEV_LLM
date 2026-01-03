/**********************************************************/
/* sigcontext.inc - PL/I translation of Linux sigcontext.h*/
/**********************************************************/
/*
 * As documented in the iBCS2 standard..
 *
 * The first part of "struct _fpstate" is just the normal i387
 * hardware setup, the extra "status" word is used to save the
 * coprocessor status word before entering the handler.
 *
 * Pentium III FXSR, SSE support
 *      Gareth Hughes <gareth@valinux.com>, May 2000
 *
 * The FPU state data structure has had to grow to accommodate the
 * extended FPU state required by the Streaming SIMD Extensions.
 * There is no documented standard to accomplish this at the moment.
 */
 
 dcl    1 fpreg               based,
          5 significand       bit(64),
	  5 exponent          bit(16);
	  
 dcl    1 fpxreg              based,
          5 significand       bit(64),
	  5 exponent          bit(16),
	  5 padding           bit(48);
	  
 dcl    1 xmmreg              based,
          5 element           bit(128);
	  
 dcl    1 fpstate             based,
          5 cw                bit(32),
          5 sw                bit(32),
          5 tag               bit(32),
          5 ipoff             bit(32),
          5 cssel             bit(32),
          5 dataoff           bit(32),
          5 datasel           bit(32),
          5 st           (0:7)like fpreg,
          5 status            bit(16),
          5 magic             bit(16),      /* 'FFFF'x = regular FPU data only */
 /* FXSR FPU environment */
          5 fxsr_env     (0:6)bit(32),
	  5 mxcsr             bit(32),
	  5 reserved          bit(32),
	  5 fxsr_st      (0:7)like fpreg,
	  5 xmm          (0:7)like xmmreg,
	  5 padding           char(224);
	  
 dcl    1 sigcontext          based,
          5 gs                fixed bin(15),                    /* 00 */
          5 gsh               fixed bin(15),                    /* 02 */
          5 fs                fixed bin(15),                    /* 04 */
          5 fsh               fixed bin(15),                    /* 06 */
          5 es                fixed bin(15),                    /* 08 */
          5 esh               fixed bin(15),                    /* 0A */
          5 ds                fixed bin(15),                    /* 0C */
          5 dsh               fixed bin(15),                    /* 0E */
          5 edi               fixed bin(31),                    /* 10 */
          5 esi               fixed bin(31),                    /* 14 */
          5 ebp               fixed bin(31),                    /* 18 */
          5 esp               fixed bin(31),                    /* 1C */
          5 ebx               fixed bin(31),                    /* 20 */
          5 edx               fixed bin(31),                    /* 24 */
          5 ecx               fixed bin(31),                    /* 28 */
          5 eax               fixed bin(31),                    /* 2C */
          5 trapno            fixed bin(31),                    /* 30 */
          5 err               fixed bin(31),                    /* 34 */
          5 eip               fixed bin(31),                    /* 38 */
          5 cs                fixed bin(15),                    /* 3C */
          5 csh               fixed bin(15),                    /* 3E */
          5 eflags            fixed bin(31),                    /* 40 */
          5 esp_at_signal     fixed bin(31),                    /* 44 */
          5 ss                fixed bin(15),                    /* 48 */
          5 ssh               fixed bin(15),                    /* 4A */
	  5 pfpstate          ptr,                              /* 4C */
	  5 oldmask           bit(32),                          /* 50 */
	  5 cr2               bit(32);                          /* 54 */
