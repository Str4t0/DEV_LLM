# Makefile for PL/I Runtime Library
# Combined makefile for OS/2 and Linux
# Iron Spring PL/I 0.9.2
# Modifications:
#    2011-01-25: Consolidate Linux and OS/2			   0.9.2
#    2010-06-28: Separate OS-dependent procedures                  0.9.1

# ***** OS/2 *****
ifeq ($(MAKECMDGOALS),os2)
  SYS = os2
  X = obj
  OBJ = omf
  PLI = ..\plic
  ASMFLGS  = -${OBJ} -4 -Fl=$*.lst -Fo=$*.obj -Isource/${SYS} -Isource/asm -Sa -Sg -nc=CODE -nd=DATA32
  PLIFLGS = -dLIB -T -cn(^^) -lsiaxgmo -ew -d${OBJ}
  LIB     = wlib
  LIBFLGS = -n -l -t 
  SPECIAL = osevent.obj osmutex.obj dummy.obj
# ***** Linux *****
else  ifeq ($(MAKECMDGOALS),linux)
  SYS = linux
  X = o
  ALTOBJ= alt/fhs.o alt/ghs.o
  OBJ = elf
#  PLI = ../plic
  PLI = ~/pli/dev/comp/plic
  ASMFLGS  = -${OBJ} -4 -Fl=$*.lst -Fo=$*.o -Isource/${SYS} -Isource/asm -Sa -Sg
  PLIFLGS = "-dLIB -T -cn(^) -lsiaxgmo -ew" -d${OBJ}
  SPECIAL = closedir.o futex.o heap.o offtime.o opendir.o readdir.o siginit.o syscall.o isam.o 
# ***** ERROR *****
else  ifeq ($(MAKECMDGOALS),distclean)
else  ifneq ($(MAKECMDGOALS),clean)
  $(error Must make os2 or linux)
endif

ASM     = jwasm
INC	= include
SRC	= source

# PL/I Library programs
OBJS =  delay.${X}              disp.${X}	                                                        \
	dyndesc.${X}		f2i.${X}		fpo.${X}	getdsa.${X}			\
	gss.${X}	        tbs.${X}        	hyper.${X} 	iic.${X}        incr.${X}	\
	kbs.${X}		math.${X}		mbs.${X}	mod.${X}        area.${X}	\
	npi.${X}		npo.${X}		numval.${X}	onrev.${X}      oth.${X}	\
	pow.${X}		rnd.${X}		strg.${X}       strsize.${X}    subsc.${X}	\
	subsc.${X}		sysid.${X}	        cvtime.${X}                			\
	fromalien.${X}		condbif.${X}	        cnvt.${X}       integ.${X}      isub.${X}       \
	gettcb.${X}		ctl.${X} 		maa.${X}        ibmdec.${X}     refer.${X}

# PL/I Library conversion programs
CNVOBJ = cac.${X}		cba.${X}	        cbc.${X}	cbd.${X}        cdb.${X}        \
        cbs.${X}		cca.${X}		ccb.${X}	ccs.${X}        clc.${X}	\
        clx.${X}		conv.${X}		cpo.${X}        cab.${X}        
	
# PL/I Library Builtin Function programs
BIFOBJ = atan.${X}      bindex.${X}	        bnd.${X}		bool.${X}       brep.${X}       \
	cf.${X}	        trig.${X}               sum.${X}                poly.${X}                       \
	cindex.${X}	crep.${X}		cvfy.${X}		date.${X}       datetime.${X}	\
	erf.${X}	exp.${X}		hexi.${X}		plidump.${X}    time.${X}	\
	xlat.${X}	plisrt.${X}             revc.${X}               aftc.${X}       trim.${X}	\
	search.${X}     round.${X}              random.${X}             str.${X}        any.${X}
		
# PL/I I/O Library programs
IOOBJ = buff.${X}	bufi.${X}		bufo.${X}		close.${X} 	endpage.${X}		\
	fmt.${X}	get.${X}		gets.${X}		getx.${X}	ior.${X}		\
	iostat.${X}	open.${X}		put.${X}							\
	pute.${X}	puts.${X}		putx.${X}		read.${X}				\
	write.${X}	fmtsub.${X}             getd.${X}               aggio.${X}
		
# PL/I OS-dependent Library programs
OSOBJ = osclose.${X}	osdelete.${X}	osexit.${X}	osgcl.${X} 		\
	osopen.${X}	osread.${X}	osseek.${X}	oswrite.${X}		\
	ossleep.${X}	osgetdatetime.${X}		osgetprocinfo.${X}	\
	osgetenv.${X}	trace.${X}						\
	ghs.${X}	fhs.${X} 	event.${X}	tempnam.${X}		\
	beginthread.${X} oscreatethread.${X}            oskillthread.${X}			\
	init.${X}	trap.${X}	sig.${X}	xcptdump.${X}	        \
	plitask.${X}    osstat.${X}

# Temporary library programs for compiler development
DEVOBJ = dumpfcb.${X}	hexdump.${X}    version.${X}    chase_oncb_chain.${X} 

# Targets
os2: 	static/prf.lib prf.lib prf.dll
	grep -e "(WRN" *.lst

linux:	libprf.a ${ALTOBJ}
	grep -e "(WRN" *.lst || true
	
# Target for building the complete library set
allobj: ${OBJS} ${CNVOBJ} ${BIFOBJ} ${IOOBJ} ${OSOBJ} ${DEVOBJ} ${ALTOBJ} ${SPECIAL}

# --- Rules ---
%.obj:	${SRC}/${SYS}/%.pli 
	${PLI} -C ${PLIFLGS} -i ${INC}  $< -o $*.obj
%.obj:	${SRC}/${SYS}/%.asm 
	${ASM} ${ASMFLGS} $<

%.obj:	${SRC}/%.pli 
	${PLI} -C ${PLIFLGS} -i ${INC}  $< -o $*.obj
%.obj:	${SRC}/asm/%.asm 
	${ASM} ${ASMFLGS} $<

%.o:	${SRC}/${SYS}/%.pli 
	${PLI} -C ${PLIFLGS} -i ${INC}  $< -o $*.o
%.o:	${SRC}/${SYS}/%.asm 
	${ASM} ${ASMFLGS} $<

%.o:	${SRC}/%.pli 
	${PLI} -C ${PLIFLGS} -i ${INC}  $< -o $*.o
%.o:	${SRC}/asm/%.asm 
	${ASM} ${ASMFLGS} $<
	
# Rule for 'alternate' allocate and free	
alt/%.o:alt/%.pli 
	${PLI} -C ${PLIFLGS} -i ${INC}  $< -o $@

%.obj:	${SRC}/${SYS}/%.asm 
	${ASM} ${ASMFLGS} $<
%.obj:	${SRC}/asm/%.asm 
	${ASM} ${ASMFLGS} $<
%.obj:	${SRC}/${SYS}/%.pli 
	${PLI} -C ${PLIFLGS} -i ${INC}  $< -o $*.obj
%.obj:	${SRC}/%.pli 
	${PLI} -C ${PLIFLGS} -i ${INC}  $< -o $*.obj

# Linux static library
libprf.a: ${OBJS} ${CNVOBJ} ${BIFOBJ} ${IOOBJ} ${OSOBJ} ${DEVOBJ} ${SPECIAL} plistart.o plitabs.o
	rm -f libprf.a
	ar -q libprf.a *.o
	${PLI} -V

# OS/2 static library, includings the real plistart module.
static/prf.lib:	${OBJS} ${CNVOBJ} ${BIFOBJ} ${IOOBJ} ${OSOBJ} ${DEVOBJ} ${SPECIAL} plistart.obj plitabs.obj
	${LIB} -n -l -t static\prf.lib plistart.obj @prf.lbc
	seticon $*.lib , lib.ico
	grep -e "(WRN" *.lst
	${PLI} -V

# OS/2 import library, including the real plistart module.
prf.lib: ${OBJS} ${CNVOBJ} ${BIFOBJ} ${IOOBJ} ${OSOBJ} ${DEVOBJ} ${SPECIAL} plistart.obj plitabs.obj prf.def
	IMPLIB prf.lib prf.def
	${LIB} -t -b prf.lib +plistart.obj 
	seticon $*.lib , lib.ico

# OS/2 DLL, including the dummy plistart module.
# We need a temporary library because LINK386 chokes on the long list of .obj files.
prf.dll: ${OBJS} ${CNVOBJ} ${BIFOBJ} ${IOOBJ} ${OSOBJ} ${DEVOBJ} ${SPECIAL} dummy.obj prf.def
	${LIB} -n -t temp.lib dummy.obj @prf.lbc
	LINK386 /m:f /a:8 /e:2 temp.lib,prf.dll,,static\OS2386.lib,prf.def;
	del temp.lib
	

clean:
	rm *.o *.obj *.lst libprf.a build.log alt/*.o
distclean:
	rm *.o *.obj *.lst

