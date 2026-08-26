BLDDIR = build

# Necessary because zip copies leading directories if run from above targets
ABS_BLDDIR := $(abspath $(BLDDIR))

all: xpi

xpi: $(BLDDIR)/lyz.xpi

$(BLDDIR)/lyz.xpi:
	@mkdir -p $(dir $@)
	cd addon; zip -FSr $(ABS_BLDDIR)/lyz.xpi * -x \*.swp -x '#*#' -x \*~

clean:
	rm -f $(BLDDIR)/lyz.xpi

test:
	npm test
	npm run check

.PHONY: all clean test xpi
