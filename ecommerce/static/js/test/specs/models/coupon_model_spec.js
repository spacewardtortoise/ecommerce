define([
        'jquery',
        'js-cookie',
        'moment',
        'underscore',
        'models/coupon_model',
        'test/mock_data/coupons'
    ],
    function ($,
              Cookies,
              moment,
              _,
              Coupon,
              Mock_Coupons) {
        'use strict';

        var discountCodeData = Mock_Coupons.discountCodeCouponModelData,
            enrollmentCodeData = Mock_Coupons.enrollmentCodeCouponModelData;

        describe('Coupon model', function () {
            describe('validation', function () {
                var model;

                beforeEach(function () {
                    spyOn($, 'ajax');
                    model = Coupon.findOrCreate(discountCodeData, {parse: true});
                });

                it('should validate dates', function () {
                    model.validate();
                    expect(model.isValid()).toBeTruthy();

                    model.set('start_date', 'not a real date');
                    model.set('end_date', 'not a real date');
                    model.validate();
                    expect(model.isValid()).toBeFalsy();

                    model.set('start_date', '2015-11-11T00:00:00Z');
                    model.set('end_date', '2015-10-10T00:00:00Z');
                    model.validate();
                    expect(model.isValid()).toBeFalsy();
                });

                it('should validate discount code has discount type and value', function () {
                    model.set('benefit_value', '');
                    model.set('benefit_type', '');
                    model.validate();
                    expect(model.isValid()).toBeFalsy();
                });

                it('should validate course ID if the catalog is a Single Course Catalog', function () {
                    model.set('catalog_type', 'Single course');
                    model.set('course_id', '');
                    model.validate();
                    expect(model.isValid()).toBeFalsy();

                    model.set('course_id', 'a/b/c');
                    model.validate();
                    expect(model.isValid()).toBeTruthy();
                });

                it('should validate seat type if the catalog is a Single Course Catalog', function () {
                    model.set('catalog_type', 'Single course');
                    model.set('seat_type', '');
                    model.validate();
                    expect(model.isValid()).toBeFalsy();

                    model.set('seat_type', 'Verified');
                    model.validate();
                    expect(model.isValid()).toBeTruthy();
                });

                it('should validate catalog query and course seat types for Multiple Courses Catalog', function () {
                    model.set('catalog_type', 'Multiple courses');
                    model.set('catalog_query', '');
                    model.validate();
                    expect(model.isValid()).toBeFalsy();

                    model.set('catalog_query', '*:*');
                    model.set('course_seat_types', []);
                    model.validate();
                    expect(model.isValid()).toBeFalsy();

                    model.set('catalog_query', '*:*');
                    model.set('course_seat_types', ['verified']);
                    model.validate();
                    expect(model.isValid()).toBeTruthy();
                });

                it('should validate invoice data.', function() {
                    model.set('price', 'text');
                    model.validate();
                    expect(model.isValid()).toBeFalsy();
                    model.set('price', 100);
                    model.validate();
                    expect(model.isValid()).toBeTruthy();

                    model.set('invoice_discount_value', 'text');
                    model.validate();
                    expect(model.isValid()).toBeFalsy();
                    model.set('invoice_discount_value', 100);
                    model.validate();
                    expect(model.isValid()).toBeTruthy();
                });

                it('should validate coupon code.', function() {
                    model.set('code', '!#$%&/()=');
                    model.validate();
                    expect(model.isValid()).toBeFalsy();

                    model.set('code', 'CODE12345');
                    model.validate();
                    expect(model.isValid()).toBeTruthy();
                });
            });

            describe('test model methods', function () {
                it('should return seat price if a coupon has a seat', function () {
                    var model = new Coupon();

                    expect(model.getSeatPrice()).toEqual('');

                    model.set('seats', [{'price': 100}]);
                    expect(model.getSeatPrice()).toEqual(100);
                });

                it('should set max uses 1 if voucher usage Single use', function () {
                    var model = new Coupon();
                    model.set('vouchers', [{ usage: 'Single use' }]);

                    model.updateVoucherData();
                    expect(model.get('max_uses')).toBe(1);
                });
            });

            describe('save', function () {
                it('should POST enrollment data', function () {
                    var model, args, ajaxData;
                    spyOn($, 'ajax');
                    model = Coupon.findOrCreate(enrollmentCodeData, {parse: true});
                    model.save();
                    expect($.ajax).toHaveBeenCalled();
                    args = $.ajax.calls.argsFor(0);
                    ajaxData = JSON.parse(args[0].data);
                    expect(ajaxData.benefit_type).toEqual('Percentage');
                    expect(ajaxData.benefit_value).toEqual(100);
                    expect(ajaxData.quantity).toEqual(1);
                    expect(model.get('start_datetime')).toEqual(moment.utc(model.get('start_date')));
                    expect(model.get('end_datetime')).toEqual(moment.utc(model.get('end_date')));
                });

                it('should POST discount data', function () {
                    var model, args, ajaxData;
                    spyOn($, 'ajax');
                    model = Coupon.findOrCreate(discountCodeData, {parse: true});
                    model.save();
                    expect($.ajax).toHaveBeenCalled();
                    args = $.ajax.calls.argsFor(0);
                    ajaxData = JSON.parse(args[0].data);
                    expect(ajaxData.quantity).toEqual(1);
                    expect(model.get('start_datetime')).toEqual(moment.utc(model.get('start_date')));
                    expect(model.get('end_datetime')).toEqual(moment.utc(model.get('end_date')));
                });

                it('should format start and end date if they are patch updated', function () {
                    var end_date = '2016-11-11T00:00:00Z',
                        model = Coupon.findOrCreate(discountCodeData, {parse: true}),
                        start_date = '2015-11-11T00:00:00Z',
                        title = 'Coupon title';
                    spyOn(Backbone.RelationalModel.prototype, 'save');
                    model.save(
                        {
                            end_date: end_date,
                            start_date: start_date,
                            title: title
                        },
                        {patch: true}
                    );

                    expect(Backbone.RelationalModel.prototype.save).toHaveBeenCalledWith(
                        {
                            end_datetime: moment.utc(end_date),
                            name: title,
                            start_datetime: moment.utc(start_date),
                            title: title
                        },
                        {
                            patch: true,
                            headers: {'X-CSRFToken': Cookies.get('ecommerce_csrftoken')},
                            contentType: 'application/json'
                        }
                    );
                });
            });

        });
});
