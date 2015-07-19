'use strict';
/**
 * Copy extension
 *
 * @author    Julien Sanchez <julien@akeneo.com>
 * @author    Filips Alpe <filips@akeneo.com>
 * @author    Yohan Blain <yohan.blain@akeneo.com>
 * @copyright 2015 Akeneo SAS (http://www.akeneo.com)
 * @license   http://opensource.org/licenses/osl-3.0.php  Open Software License (OSL 3.0)
 */
define(
    [
        'jquery',
        'underscore',
        'pim/form',
        'oro/mediator',
        'text!pim/template/product/tab/attribute/copy',
        'pim/product-edit-form/attributes/copyfield',
        'pim/field-manager',
        'pim/attribute-manager',
        'pim/user-context'
    ],
    function (
        $,
        _,
        BaseForm,
        mediator,
        template,
        CopyField,
        FieldManager,
        AttributeManager,
        UserContext
    ) {
        return BaseForm.extend({
            template: _.template(template),
            className: 'attribute-copy-actions',
            copyFields: {},
            copying: false,
            locale: null,
            scope: null,
            events: {
                'click .start-copying': 'startCopying',
                'click .stop-copying': 'stopCopying',
                'click .select-all': 'selectAll',
                'click .select-all-visible': 'selectAllVisible',
                'click .copy': 'copy'
            },

            /**
             * Configure this extension
             *
             * @returns {Promise}
             */
            configure: function () {
                this.locale = UserContext.get('catalogLocale');
                this.scope  = UserContext.get('catalogScope');

                this.listenTo(mediator, 'field:extension:add', this.addFieldExtension);

                return BaseForm.prototype.configure.apply(this, arguments);
            },

            /**
             * Return the values object from which data must be copied
             *
             * @returns {Object}
             */
            getSourceData: function () {
                return this.getFormData().values;
            },

            /**
             * Render the copy panel
             *
             * @returns {Object}
             */
            render: function () {
                this.trigger('comparison:change', this.copying);

                this.$el.html(this.template({'copying': this.copying}));
                if (this.copying) {
                    this.renderExtensions();
                }

                this.delegateEvents();

                return this;
            },

            /**
             * Render the copy element inside each field that can be copied
             *
             * @param {Object} event
             */
            addFieldExtension: function (event) {
                var field = event.field;
                event.promises.push(
                    this.canBeCopied(field)
                        .then(_.bind(function (canBeCopied) {
                            if (canBeCopied && this.copying) {
                                field.addElement('comparison', this.code, this.getCopyField(field));
                            }
                        }, this))
                );
            },

            /**
             * Get or create a copy field object corresponding to the specified field
             *
             * @param {Field} field
             * @returns {CopyField}
             */
            getCopyField: function (field) {
                var code = field.attribute.code;
                if (!_.has(this.copyFields, code)) {
                    var sourceData = this.getSourceData();
                    var valueToCopy = AttributeManager.getValue(
                        sourceData[code],
                        field.attribute,
                        this.locale,
                        this.scope
                    );

                    var copyField = new CopyField();
                    copyField.setLocale(this.locale);
                    copyField.setScope(this.scope);
                    copyField.setValue(valueToCopy);
                    copyField.setField(field);

                    this.copyFields[code] = copyField;
                }

                return this.copyFields[code];
            },

            /**
             * Indicate if the specified field can be copied
             *
             * @param {Field} field
             * @returns {Promise}
             */
            canBeCopied: function (field) {
                return $.Deferred().resolve(field.attribute.localizable || field.attribute.scopable).promise();
            },

            /**
             * Launch the copy process for selected fields
             */
            copy: function () {
                _.each(this.copyFields, _.bind(function (copyField) {
                    if (copyField.selected && copyField.field && copyField.field.isEditable()) {
                        var formValues = this.getFormModel().get('values');
                        var oldValue = AttributeManager.getValue(
                            formValues[copyField.field.attribute.code],
                            copyField.field.attribute,
                            UserContext.get('catalogLocale'),
                            UserContext.get('catalogScope')
                        );

                        oldValue.data = copyField.value.data;
                        mediator.trigger('entity:form:edit:update_state');
                        copyField.setSelected(false);
                    }
                }, this));

                this.trigger('copy:copy-fields:after');
            },

            /**
             * Enter in copy mode
             */
            startCopying: function () {
                this.copying = true;
                this.triggerContextChange();
            },

            /**
             * Close copy mode
             */
            stopCopying: function () {
                this.copying = false;
                this.triggerContextChange();
            },

            /**
             * Change the locale for copy context
             *
             * @param {string} locale
             */
            setLocale: function (locale) {
                this.locale = locale;
                this.triggerContextChange();
            },

            /**
             * Get the current locale for copy
             *
             * @returns {string}
             */
            getLocale: function () {
                return this.locale;
            },

            /**
             * Change the scope for copy context
             *
             * @param {string} scope
             */
            setScope: function (scope) {
                this.scope = scope;
                this.triggerContextChange();
            },

            /**
             * Get the current scope for copy
             *
             * @returns {string}
             */
            getScope: function () {
                return this.scope;
            },

            /**
             * Reset copy fields cache then trigger the context change event
             */
            triggerContextChange: function () {
                this.copyFields = {};
                this.trigger('copy:context:change');
            },

            /**
             * Mark all fields (from all attribute groups) as selected
             */
            selectAll: function () {
                var fieldPromises = [];
                _.each(this.getSourceData(), _.bind(function (value, attributeCode) {
                    fieldPromises.push(FieldManager.getField(attributeCode));
                }, this));

                $.when.apply(this, fieldPromises)
                    .then(_.bind(function () {
                        this.selectFields(arguments);
                    }, this));
            },

            /**
             * Mark all visible fields (from active attribute group) as selected
             */
            selectAllVisible: function () {
                this.selectFields(FieldManager.getVisibleFields());
            },

            /**
             * Mark specified fields as selected and trigger the select event
             *
             * @param {Field[]} fields
             */
            selectFields: function (fields) {
                var selectPromises = [];
                _.each(fields, _.bind(function (field) {
                    selectPromises.push(
                        this.canBeCopied(field)
                            .then(_.bind(function (canBeCopied) {
                                if (canBeCopied) {
                                    this.getCopyField(field).setSelected(true);
                                }
                            }, this))
                    );
                }, this));

                $.when.apply(this, selectPromises)
                    .then(_.bind(function () {
                        this.trigger('copy:select:after');
                    }, this));
            }
        });
    }
);
